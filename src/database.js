const fs = require('fs');
const path = require('path');

const dataBase = (filePath) => {
    const absolutePath = path.resolve(filePath);
    
    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return {
        read: async () => {
            try {
                if (!fs.existsSync(absolutePath)) return {};
                const data = fs.readFileSync(absolutePath, 'utf8');
                return JSON.parse(data);
            } catch (e) {
                console.error('Error reading database:', e);
                return {};
            }
        },
        write: async (data) => {
            try {
                fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2));
                return true;
            } catch (e) {
                console.error('Error writing database:', e);
                return false;
            }
        }
    };
};

module.exports = { dataBase };
