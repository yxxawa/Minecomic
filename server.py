
import uvicorn
from fastapi import FastAPI, HTTPException, Query
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

# --- Helpers ---
def natural_key(string_):
    """
    Sort strings containing numbers naturally.
    e.g. 1.jpg, 2.jpg, 10.jpg instead of 1.jpg, 10.jpg, 2.jpg
    """
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r'(\d+)', string_)]

# --- Logging ---
server_logs = []
log_lock = threading.Lock()
metadata_lock = threading.Lock()

def log(msg: str):
    """Log to console and memory"""
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
    """Kill the server process"""
    pid = os.getpid()
    # Schedule kill in a separate thread to allow response to return
    def kill_self():
        time.sleep(0.5)
        os.kill(pid, signal.SIGTERM)
        
    threading.Thread(target=kill_self).start()
    return {"status": "shutting_down", "pid": pid}

# --- Metadata System ---
def load_all_metadata():
    if not os.path.exists(METADATA_FILE):
        return {}
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading metadata: {e}")
        return {}

def save_all_metadata(data):
    with metadata_lock:
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

@app.post("/update_metadata")
def update_metadata(data: Dict[str, Any]):
    manga_id = data.get("id")
    if not manga_id:
        raise HTTPException(400, "Missing ID")
    
    all_meta = load_all_metadata()
    if manga_id not in all_meta:
        all_meta[manga_id] = {}
    
    for k, v in data.items():
        if k != "id":
            all_meta[manga_id][k] = v
            
    save_all_metadata(all_meta)
    return {"status": "ok", "metadata": all_meta[manga_id]}

@app.get("/metadata/{manga_id}")
def get_metadata(manga_id: str):
    all_meta = load_all_metadata()
    return all_meta.get(manga_id, {})

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

def get_jm_option(base_dir=None, suffix=".jpg", thread_count=3):
    # Default base_dir fallback
    if base_dir is None:
        base_dir = os.path.abspath(DOWNLOAD_DIR)
    
    # Rule: Bd_Pname
    # When base_dir is "./downloads/ID", this rule creates "./downloads/ID/[Title]/..."
    dir_rule_config = {
        "rule": "Bd_Pname", 
        "base_dir": base_dir
    }

    try:
        # Create JmOption
        option = JmOption(
            dir_rule=dir_rule_config,
            download={
                "cache": True,
                "image": {
                    "decode": True, 
                    "suffix": suffix if suffix else None, # None means original
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
        # Fallback
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
        # Generic option for search
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
    # entry.name is the ID folder
    folder_name = entry.name
    manga_path = entry.path
    base_url = "http://localhost:8000/files"
    
    manga_path_enc = quote(folder_name)

    # 1. Try to read xiangxi.txt (Details File)
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
                tags = saved_details.get("tags", [])
                if not isinstance(kws, list): kws = []
                if isinstance(tags, list):
                    for t in tags:
                        if t not in kws: kws.append(t)
                extra_info["keywords"] = kws
        except Exception as e:
            pass

    manga_id = extra_info["id"] if extra_info["id"] else folder_name
    manga_title = extra_info["title"] if extra_info["title"] else folder_name

    # 2. Scan Chapters (Folders inside ID folder)
    # The folders inside the ID folder are the chapters/volumes (named by Title due to Bd_Pname)
    try:
        # Use natural sort for chapters
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
                # Use natural sort for images
                images = sorted([
                    f.name for f in os.scandir(chapter_entry.path) 
                    if f.is_file() and f.name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
                ], key=natural_key)
            except:
                images = []

            chapter_name_enc = quote(chapter_name)
            
            # Set Cover
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
        all_metadata = load_all_metadata()
        
        with os.scandir(DOWNLOAD_DIR) as it:
            entries = list(it)
            # Use natural sort for manga folders
            entries.sort(key=lambda e: natural_key(e.name))
            
            for entry in entries:
                if entry.is_dir():
                    # Parse each ID folder
                    manga_data = parse_manga_folder(entry, full_scan=False)
                    if manga_data:
                        meta = all_metadata.get(manga_data['id'], {})
                        # Override title if in metadata (e.g. from sync)
                        if 'title' in meta:
                            manga_data['title'] = meta['title']
                            
                        manga_data['readCount'] = meta.get('readCount', 0)
                        manga_data['isPinned'] = meta.get('isPinned', False)
                        manga_data['lastReadAt'] = meta.get('lastReadAt', 0)
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
    
    all_meta = load_all_metadata()
    meta = all_meta.get(manga_data['id'], {})
    
    if 'title' in meta:
        manga_data['title'] = meta['title']

    manga_data['readCount'] = meta.get('readCount', 0)
    manga_data['isPinned'] = meta.get('isPinned', False)
    manga_data['lastReadAt'] = meta.get('lastReadAt', 0)
        
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
    all_meta = load_all_metadata()
    count = 0
    
    if not os.path.exists(DOWNLOAD_DIR):
        return {"count": 0, "message": "Downloads directory not found"}

    with os.scandir(DOWNLOAD_DIR) as it:
        entries = list(it)
        for entry in entries:
            if entry.is_dir():
                manga_id = entry.name
                try:
                    # Get subdirectories
                    subs = sorted([e.name for e in os.scandir(entry.path) if e.is_dir()], key=natural_key)
                    if subs:
                        first_sub_name = subs[0]
                        
                        if manga_id not in all_meta:
                            all_meta[manga_id] = {}
                        
                        all_meta[manga_id]["title"] = first_sub_name
                        count += 1
                except Exception as e:
                    print(f"Skipping {manga_id}: {e}")
                    continue

    if count > 0:
        save_all_metadata(all_meta)
        library_cache.clear()
        
    return {"count": count}

def run_download_task(album_ids: List[str], config: Optional[DownloadConfig] = None):
    try:
        # Defaults
        suffix = ".jpg"
        threads = 3
        if config:
            suffix = config.suffix
            threads = config.thread_count

        for item_id in album_ids:
            item_id = str(item_id).strip()
            if not item_id: continue
            
            log(f"开始处理 ID: {item_id} ...")
            try:
                # 1. Create the specific Base Dir for this ID: ./downloads/{ID}
                manga_base_dir = os.path.join(os.path.abspath(DOWNLOAD_DIR), item_id)
                if not os.path.exists(manga_base_dir):
                    os.makedirs(manga_base_dir)

                # 2. Create specific Option with Bd_Pname rule
                option = get_jm_option(
                    base_dir=manga_base_dir, 
                    suffix=suffix,
                    thread_count=threads
                )
                
                # 3. Explicitly Fetch Album Info FIRST to ensure xiangxi.txt is created
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
                        log(f"√ 元数据已保存: {file_path}")

                    except Exception as e:
                        log(f"⚠ 获取详情失败: {e}")

                    # 4. Start Download
                    jmcomic.download_album(item_id, option)
                    
                else:
                    # Photo ID (Chapter) download
                    jmcomic.download_photo(item_id[1:], option)
                    
                log(f"√ {item_id} 图片下载完成")
            except Exception as e:
                log(f"× {item_id} 失败: {e}")
                traceback.print_exc()
        
        library_cache.clear()
        log("[BATCH_DONE] 所有任务处理完毕，库缓存已清除。")
        
    except Exception as e:
        log(f"下载任务发生致命错误: {e}")

@app.post("/download_batch")
def download_batch(req: DownloadRequest):
    if not req.album_ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    # Pass config to the thread function
    thread = threading.Thread(target=run_download_task, args=(req.album_ids, req.config))
    thread.daemon = True
    thread.start()
    return {"status": "accepted", "message": f"已启动 {len(req.album_ids)} 个下载任务"}

if __name__ == "__main__":
    print(f"Starting server on http://0.0.0.0:8000")
    print(f"Downloads dir: {os.path.abspath(DOWNLOAD_DIR)}")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
