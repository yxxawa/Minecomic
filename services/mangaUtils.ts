
export const naturalCompare = (aStr: string, bStr: string) => {
    const regex = /(\d+)/;
    const aParts = aStr.split(regex);
    const bParts = bStr.split(regex);

    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
        const a = aParts[i];
        const b = bParts[i];

        if (a !== b) {
            const aNum = parseInt(a, 10);
            const bNum = parseInt(b, 10);

            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.localeCompare(b);
        }
    }

    return aParts.length - bParts.length;
};
