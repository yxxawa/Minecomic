

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import jmcomic
from jmcomic import JmOption

import os
import signal
import json
import threading
import traceback
import shutil
import time
import asyncio
import re
from urllib.parse import quote

app = FastAPI()

# Enable CORS
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DOWNLOAD_DIR = "./downloads"
METADATA_FILE = "metadata.json"
SETTINGS_FILE = "settings.json"

if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

app.mount("/files", StaticFiles(directory=DOWNLOAD_DIR), name="files")

# --- Models ---
class DownloadConfig(BaseModel):
    suffix: str = ".jpg"
    thread_count: int = 3

class DownloadRequest(BaseModel):
    album_ids: List[str]
    config: Optional[DownloadConfig] = None

class DeleteRequest(BaseModel):
    manga_name: str

class MangaDetailRequest(BaseModel):
    manga_id: str

class BatchMetadataRequest(BaseModel):
    updates: List[Dict[str, Any]]

# --- Helpers ---
def natural_key(string_):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r'(\d+)', string_)]

# --- Logging ---
server_logs = []
log_lock = threading.Lock()
metadata_lock = threading.Lock()
settings_lock = threading.Lock()

def log(msg: str):
    timestamp = time.strftime("%H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    print(entry)
    with log_lock:
        server_logs.insert(0, entry)
        if len(server_logs) > 100:
            server_logs.pop()

@app.get("/logs")
def get_logs():
    with log_lock:
        return {"logs": server_logs}

# --- Startup ---
@app.on_event("startup")
async def startup_event():
    loop = asyncio.get_running_loop()
    def custom_exception_handler(loop, context):
        exception = context.get("exception")
        if exception:
            if isinstance(exception, ConnectionResetError): return
            if isinstance(exception, OSError) and getattr(exception, "winerror", None) == 10054: return
        loop.default_exception_handler(context)
    loop.set_exception_handler(custom_exception_handler)

# --- Shutdown Endpoint ---
@app.post("/shutdown")
def shutdown():
    pid = os.getpid()
    def kill_self():
        time.sleep(0.5)
        os.kill(pid, signal.SIGTERM)
    threading.Thread(target=kill_self).start()
    return {"status": "shutting_down", "pid": pid}

# --- Settings System ---
def load_settings_file():
    default_settings = {
        "app": {
            "theme": "fresh",
            "enableScrollTurn": False,
            "panicKey": "F12",
            "readerBackgroundColor": "#0f172a",
            "longPressDuration": 200,
            "toggleMenuKey": "m",
            "enableDownloadPopup": True,
            "collections": [] 
        },
        "download": {
            "suffix": ".jpg",
            "thread_count": 3
        }
    }
    
    if not os.path.exists(SETTINGS_FILE):
        return default_settings
        
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            saved = json.load(f)
            # Merge defaults to ensure structure exists
            if "app" not in saved: saved["app"] = default_settings["app"]
            if "download" not in saved: saved["download"] = default_settings["download"]
            # Merge keys inside app/download to handle new settings
            for k, v in default_settings["app"].items():
                if k not in saved["app"]: saved["app"][k] = v
            for k, v in default_settings["download"].items():
                if k not in saved["download"]: saved["download"][k] = v
            return saved
    except Exception as e:
        print(f"Error loading settings: {e}")
        return default_settings

def save_settings_file(data):
    with settings_lock:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

@app.get("/settings")
def get_settings():
    return load_settings_file()

@app.post("/settings")
def update_settings(data: Dict[str, Any] = Body(...)):
    current = load_settings_file()
    
    # Deep merge simple 2-level structure
    if "app" in data:
        current["app"].update(data["app"])
    if "download" in data:
        current["download"].update(data["download"])
        
    save_settings_file(current)
    return current

# --- Metadata System ---
def load_all_metadata_internal():
    if not os.path.exists(METADATA_FILE):
        return {}
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading metadata: {e}")
        return {}

def save_all_metadata_internal(data):
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# --- Cache ---
class LibraryCache:
    def __init__(self):
        self.data = []
        self.last_updated = 0
        self.lock = threading.Lock()
        self.cache_duration = 300 

    def get(self):
        if time.time() - self.last_updated < self.cache_duration and self.data:
            return self.data
        return None

    def set(self, data):
        with self.lock:
            self.data = data
            self.last_updated = time.time()

    def clear(self):
        with self.lock:
            self.data = []
            self.last_updated = 0

library_cache = LibraryCache()

@app.post("/update_metadata")
def update_metadata(data: Dict[str, Any]):
    manga_id = data.get("id")
    if not manga_id:
        raise HTTPException(400, "Missing ID")
    
    # Lock the entire read-modify-write process
    with metadata_lock:
        all_meta = load_all_metadata_internal()
        if manga_id not in all_meta:
            all_meta[manga_id] = {}
        
        for k, v in data.items():
            if k != "id":
                all_meta[manga_id][k] = v
                
        save_all_metadata_internal(all_meta)
        # Clear cache so next library scan picks up the change immediately
        library_cache.clear()
        
        return {"status": "ok", "metadata": all_meta[manga_id]}

@app.post("/update_metadata_batch")
def update_metadata_batch(req: BatchMetadataRequest):
    with metadata_lock:
        all_meta = load_all_metadata_internal()
        
        updated_count = 0
        for item in req.updates:
            manga_id = item.get("id")
            if not manga_id: continue
            
            if manga_id not in all_meta:
                all_meta[manga_id] = {}
            
            for k, v in item.items():
                if k != "id":
                    all_meta[manga_id][k] = v
            updated_count += 1
            
        save_all_metadata_internal(all_meta)
        # Clear cache so next library scan picks up the change immediately
        library_cache.clear()
        
        return {"status": "ok", "updated": updated_count}

@app.get("/metadata/{manga_id}")
def get_metadata(manga_id: str):
    # Use internal load, but no lock needed for just reading usually, 
    # but strictly correct to lock if high concurrency writing
    with metadata_lock:
        all_meta = load_all_metadata_internal()
    return all_meta.get(manga_id, {})

def get_jm_option(base_dir=None, suffix=".jpg", thread_count=3):
    if base_dir is None:
        base_dir = os.path.abspath(DOWNLOAD_DIR)
    
    dir_rule_config = {
        "rule": "Bd_Pname", 
        "base_dir": base_dir
    }

    try:
        option = JmOption(
            dir_rule=dir_rule_config,
            download={
                "cache": True,
                "image": {
                    "decode": True, 
                    "suffix": suffix if suffix else None,
                },
                "threading": {
                    "image": 30, 
                    "photo": 24, 
                    "max_workers": thread_count 
                }
            },
            client={
                "cache": None,
                "domain": [],
                "postman": {
                    "type": "curl_cffi",
                    "meta_data": {"impersonate": "chrome"}
                },
                "impl": "api",
                "retry_times": 5
            },
            plugins={} 
        )
        return option
    except Exception as e:
        log(f"JmOption init error/warning: {e}. Falling back.")
        option = JmOption.default()
        option.dir_rule.base_dir = base_dir
        option.dir_rule.rule = "Bd_Pname"
        return option

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Service is running"}

@app.get("/search")
def search_manga(q: str):
    try:
        option = get_jm_option()
        client = option.new_jm_client()
        search_page = client.search_site(search_query=q, page=1)
        results = []
        count = 0
        for item in search_page:
            if count >= 30: break
            if isinstance(item, tuple) and len(item) >= 2:
                album_id, title = item[0], item[1]
            else:
                album_id = getattr(item, 'id', str(item))
                title = getattr(item, 'title', 'Unknown')
            results.append({"id": album_id, "title": title, "author": "JMComic", "category": "Manga"})
            count += 1
        return {"query": q, "total": len(results), "results": results}
    except Exception as e:
        log(f"Search error: {e}")
        return {"query": q, "total": 0, "results": [], "error": str(e)}

# --- Core: Parse Manga Folder ---
def parse_manga_folder(entry: os.DirEntry, full_scan=False):
    folder_name = entry.name
    manga_path = entry.path
    base_url = "http://localhost:8000/files"
    manga_path_enc = quote(folder_name)

    details_file = os.path.join(manga_path, "xiangxi.txt")
    extra_info = {
        "id": None, 
        "title": None, 
        "author": "Unknown",
        "keywords": []
    }
    
    if os.path.exists(details_file):
        try:
            with open(details_file, "r", encoding="utf-8") as f:
                saved_details = json.load(f)
                extra_info["id"] = saved_details.get("id")
                extra_info["title"] = saved_details.get("title")
                extra_info["author"] = saved_details.get("author", "Unknown")
                kws = saved_details.get("keywords", [])
                extra_info["keywords"] = kws
        except Exception as e:
            pass

    manga_id = extra_info["id"] if extra_info["id"] else folder_name
    manga_title = extra_info["title"] if extra_info["title"] else folder_name

    try:
        sub_items = sorted([e for e in os.scandir(manga_path)], key=lambda x: natural_key(x.name))
    except Exception:
        return None

    sub_dirs = [i for i in sub_items if i.is_dir()]
    chapters = []
    cover_url = ""

    for chapter_entry in sub_dirs:
        chapter_name = chapter_entry.name
        pages = []
        is_first_chapter = (chapter_entry == sub_dirs[0])
        
        if full_scan or is_first_chapter:
            try:
                images = sorted([
                    f.name for f in os.scandir(chapter_entry.path) 
                    if f.is_file() and f.name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif'))
                ], key=natural_key)
            except:
                images = []

            chapter_name_enc = quote(chapter_name)
            if not full_scan and is_first_chapter and images:
                cover_url = f"{base_url}/{manga_path_enc}/{chapter_name_enc}/{quote(images[0])}"
            if full_scan:
                for img in images:
                    pages.append({
                        "name": img,
                        "url": f"{base_url}/{manga_path_enc}/{chapter_name_enc}/{quote(img)}"
                    })

        chapters.append({
            "id": chapter_name, 
            "title": chapter_name,
            "pages": pages 
        })

    total_pages = 0 
    if full_scan:
        total_pages = sum(len(c['pages']) for c in chapters)
    
    if not chapters:
        return None

    return {
        "id": manga_id,        
        "title": manga_title,  
        "coverUrl": cover_url,
        "chapters": chapters,
        "totalPages": total_pages,
        "sourceId": folder_name, 
        "isFullDetails": full_scan,
        "author": extra_info["author"],
        "keywords": extra_info["keywords"]
    }

@app.get("/library")
def scan_library(refresh: bool = False):
    if refresh:
        library_cache.clear()

    cached = library_cache.get()
    if cached and not refresh:
        return {"mangas": cached}

    mangas = []
    if not os.path.exists(DOWNLOAD_DIR):
        return {"mangas": []}

    try:
        with metadata_lock:
            all_metadata = load_all_metadata_internal()
            
        with os.scandir(DOWNLOAD_DIR) as it:
            entries = list(it)
            entries.sort(key=lambda e: natural_key(e.name))
            for entry in entries:
                if entry.is_dir():
                    manga_data = parse_manga_folder(entry, full_scan=False)
                    if manga_data:
                        meta = all_metadata.get(manga_data['id'], {})
                        if 'title' in meta:
                            manga_data['title'] = meta['title']
                        manga_data['readCount'] = meta.get('readCount', 0)
                        manga_data['isPinned'] = meta.get('isPinned', False)
                        manga_data['lastReadAt'] = meta.get('lastReadAt', 0)
                        # Add collectionIds
                        manga_data['collectionIds'] = meta.get('collectionIds', [])
                        
                        mangas.append(manga_data)
        
        library_cache.set(mangas)
        return {"mangas": mangas}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

@app.get("/manga_detail")
def get_manga_detail(id: str):
    target_path = os.path.join(DOWNLOAD_DIR, id)
    if not os.path.exists(target_path):
         raise HTTPException(status_code=404, detail="Manga not found")
    
    class MockEntry:
        def __init__(self, path):
            self.path = path
            self.name = os.path.basename(path)
    
    entry = MockEntry(target_path)
    manga_data = parse_manga_folder(entry, full_scan=True)
    
    if not manga_data:
        raise HTTPException(status_code=500, detail="Failed to parse manga")
    
    with metadata_lock:
        all_meta = load_all_metadata_internal()
        
    meta = all_meta.get(manga_data['id'], {})
    if 'title' in meta:
        manga_data['title'] = meta['title']
    manga_data['readCount'] = meta.get('readCount', 0)
    manga_data['isPinned'] = meta.get('isPinned', False)
    manga_data['lastReadAt'] = meta.get('lastReadAt', 0)
    # Add collectionIds
    manga_data['collectionIds'] = meta.get('collectionIds', [])
    
    return manga_data

@app.post("/delete_manga")
def delete_manga(req: DeleteRequest):
    manga_name = req.manga_name
    if ".." in manga_name or "/" in manga_name or "\\" in manga_name:
         raise HTTPException(status_code=400, detail="Invalid manga name")
    target_path = os.path.join(DOWNLOAD_DIR, manga_name)
    if os.path.exists(target_path) and os.path.isdir(target_path):
        try:
            shutil.rmtree(target_path)
            library_cache.clear() 
            return {"status": "ok", "message": f"Deleted {manga_name}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="Manga not found")

@app.post("/sync_manga_names")
def sync_manga_names():
    with metadata_lock:
        all_meta = load_all_metadata_internal()
        
    count = 0
    if not os.path.exists(DOWNLOAD_DIR):
        return {"count": 0, "message": "Downloads directory not found"}

    with os.scandir(DOWNLOAD_DIR) as it:
        entries = list(it)
        for entry in entries:
            if entry.is_dir():
                # Logic: Title = Name of the first subdirectory
                # ID resolution: Try xiangxi.txt id, else folder name
                
                target_id = entry.name
                details_path = os.path.join(entry.path, "xiangxi.txt")
                if os.path.exists(details_path):
                    try:
                        with open(details_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            if data.get('id'):
                                target_id = str(data.get('id'))
                    except:
                        pass
                
                try:
                    sub_dirs = sorted([e.name for e in os.scandir(entry.path) if e.is_dir()], key=natural_key)
                    if sub_dirs:
                        title_candidate = sub_dirs[0]
                        
                        if target_id not in all_meta:
                            all_meta[target_id] = {}
                        
                        all_meta[target_id]["title"] = title_candidate
                        count += 1
                except Exception as e:
                    print(f"Sync error for {entry.name}: {e}")
                    continue
    
    if count > 0:
        with metadata_lock:
            # Re-read to ensure we don't clobber concurrent updates
            current_meta = load_all_metadata_internal()
            # Merge updates
            for mid, mdata in all_meta.items():
                if mid not in current_meta:
                    current_meta[mid] = {}
                current_meta[mid].update(mdata)
            save_all_metadata_internal(current_meta)
            
        library_cache.clear()
    return {"count": count}

def run_download_task(album_ids: List[str], config: Optional[DownloadConfig] = None):
    try:
        # Load settings from file if config not provided, otherwise merge/use config
        saved_settings = load_settings_file()
        
        suffix = config.suffix if config else saved_settings['download']['suffix']
        threads = config.thread_count if config else saved_settings['download']['thread_count']

        for item_id in album_ids:
            item_id = str(item_id).strip()
            if not item_id: continue
            
            log(f"开始处理 ID: {item_id} ...")
            try:
                manga_base_dir = os.path.join(os.path.abspath(DOWNLOAD_DIR), item_id)
                if not os.path.exists(manga_base_dir):
                    os.makedirs(manga_base_dir)

                option = get_jm_option(
                    base_dir=manga_base_dir, 
                    suffix=suffix,
                    thread_count=threads
                )
                
                if not item_id.lower().startswith('p'):
                    log(f"正在获取 {item_id} 元数据...")
                    client = option.new_jm_client()
                    
                    try:
                        album = client.get_album_detail(item_id)
                        details = {
                            "id": str(album.album_id),
                            "title": album.title,
                            "author": str(album.author) if album.author else "Unknown",
                            "keywords": album.keywords if hasattr(album, 'keywords') else [],
                            "tags": album.tags if hasattr(album, 'tags') else [],
                            "description": album.description if hasattr(album, 'description') else "",
                            "total_pages": len(album) if hasattr(album, '__len__') else 0,
                            "downloaded_at": time.time()
                        }
                        file_path = os.path.join(manga_base_dir, "xiangxi.txt")
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(details, f, ensure_ascii=False, indent=2)
                        
                        # Update global metadata cache immediately for frontend polling
                        with metadata_lock:
                            all_meta = load_all_metadata_internal()
                            if item_id not in all_meta: all_meta[item_id] = {}
                            all_meta[item_id]['title'] = album.title
                            save_all_metadata_internal(all_meta)
                            # Clear cache
                            library_cache.clear()

                        log(f"✅ 元数据已保存: {file_path}")
                    except Exception as e:
                        log(f"⚠️ 获取详情失败: {e}")

                    jmcomic.download_album(item_id, option)
                else:
                    jmcomic.download_photo(item_id[1:], option)
                    
                log(f"✅ {item_id} 图片下载完成")
            except Exception as e:
                log(f"❌ {item_id} 失败: {e}")
                traceback.print_exc()
        
        library_cache.clear()
        log("[BATCH_DONE] 所有任务处理完毕，库缓存已清除。")
        
    except Exception as e:
        log(f"下载任务发生致命错误: {e}")

@app.post("/download_batch")
def download_batch(req: DownloadRequest):
    if not req.album_ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    thread = threading.Thread(target=run_download_task, args=(req.album_ids, req.config))
    thread.daemon = True
    thread.start()
    return {"status": "accepted", "message": f"已启动 {len(req.album_ids)} 个下载任务"}

if __name__ == "__main__":
    print(f"Starting server on http://0.0.0.0:8000")
    print(f"Downloads dir: {os.path.abspath(DOWNLOAD_DIR)}")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
