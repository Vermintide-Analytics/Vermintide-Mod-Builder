const pfs = require('./lib/pfs');
const path = require('./lib/path');

const defaultTempDir = '.temp';

let config = {
    defaultTempDir,

    defaultData: {
        mods_dir: 'mods',
        temp_dir: '',

        game: 2,

        game_id1: '235540',
        game_id2: '552500',

        tools_id1: '718610',
        tools_id2: '718610',

        fallback_tools_dir1: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',
        fallback_tools_dir2: 'C:/Program Files (x86)/Steam/steamapps/common/Warhammer End Times Vermintide Mod Tools/',

        fallback_workshop_dir1: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/',
        fallback_workshop_dir2: 'C:/Program Files (x86)/Steam/steamapps/workshop/content/',

        template_dir: ".template-vmf",

        template_preview_image: "item_preview.jpg",

        template_core_files: [
            'core/**'
        ],

        ignored_dirs: [
            '.git',
            defaultTempDir
        ],

        ignore_build_errors: false
    },

    init() {
        config.filename = '.vmbrc';

        config.data = {};

        config.modsDir = '';
        config.tempDir = '';
        config.gameNumber = 0;
        config.gameId = '';
        config.toolsId = '';

        // Other config params
        config.fallbackToolsDir = '';
        config.fallbackWorkshopDir = '';
        config.ignoredDirs = [];

        // These will be replaced in the template mod when running tasks
        config.templateDir = '';
        config.templateName = '%%name';
        config.templateTitle = '%%title';
        config.templateDescription = '%%description';
        config.itemPreview = '';

        // Folder in which the built bundle is gonna be stored before being copied to workshop folder
        config.distDir = 'dist';

        // Files in template
        config.coreSrc = [];
        config.modSrc = [];

        // Paths to mod tools relative to the mod tools folder
        config.uploaderDir = 'ugc_uploader/';
        config.uploaderExe = 'ugc_tool.exe';
        config.uploaderGameConfig = 'steam_appid.txt';
        config.stingrayDir = 'bin/';
        config.stingrayExe = 'stingray_win64_dev_x64.exe';

        // Config file for workshop uploader tool
        config.cfgFile = '';
    },

    async readData(args) {
        config.filename = args.rc || config.filename;
        config.data = await readData(config.filename, args.reset);
        if (!config.data || typeof config.data != 'object') {
            throw `Invalid config data in ${config.filename}`;
        }
    },

    async parseData(args) {
        // Mods directory
        let { modsDir, tempDir } = await getModsDir(config.data.mods_dir, config.data.temp_dir, args);
        config.modsDir = modsDir;
        config.tempDir = tempDir;

        // Game number
        config.gameNumber = getGameNumber(config.data.game, args);
        config.gameId = getGameSpecificKey('game_id');
        config.toolsId = getGameSpecificKey('tools_id');

        // Other config params
        config.fallbackToolsDir = path.fix(getGameSpecificKey('fallback_tools_dir') || '');
        config.fallbackWorkshopDir = path.combine(getGameSpecificKey('fallback_workshop_dir') || '', config.gameId);
        config.ignoredDirs = config.data.ignored_dirs || [];

        config.templateDir = getTemplateDir(config.data.template_dir || config.defaultData.template_dir, args);
        config.itemPreview = config.data.template_preview_image || config.defaultData.template_preview_image;

        // Files in template
        const { coreSrc, modSrc } = getTemplateSrc(config.data.template_core_files, config.templateDir);
        config.coreSrc = coreSrc;
        config.modSrc = modSrc;

        // Config file for workshop uploader tool
        config.cfgFile = 'itemV' + config.gameNumber + '.cfg';
    },

    setData(args) {
        for (let key of Object.keys(config.data)) {

            if (args[key] === undefined) {
                continue;
            }

            if (typeof config.data[key] == 'object') {
                console.error(`Cannot set key "${key}" because it is an object. Modify ${config.filename} directly.`);
                continue;
            }

            console.log(`Set ${key} to ${args[key]}`);
            config.data[key] = args[key];
        };
    },

    async writeData() {
        await pfs.writeFile(config.filename, JSON.stringify(config.data, null, '\t'));
    }
};

async function readData(filename, shouldReset) {

    if (shouldReset && await pfs.accessible(filename)) {
        try {
            console.log(`Deleting ${filename}`);
            await pfs.unlink(filename);
        }
        catch (err) {
            console.error(err);
            throw `Couldn't delete config`;
        }
    }

    if (!await pfs.accessible(filename)) {
        try {
            console.log(`Creating default ${filename}`);
            await pfs.writeFile(filename, JSON.stringify(config.defaultData, null, '\t'));
        }
        catch (err) {
            console.error(err);
            throw `Couldn't create config`;
        }
    }

    try {
        return JSON.parse(await pfs.readFile(filename, 'utf8'));
    }
    catch (err) {
        console.error(err);
        throw `Couldn't read config`;
    }
}

function getGameSpecificKey(key){
    let id = config.data[key + config.gameNumber] || config.defaultData[key + config.gameNumber];
    if (typeof id != 'string') {
        throw `Failed to find '${key + config.gameNumber}' in ${config.filename}. It must be a string.`;
    }
    return id;
}

async function getModsDir(modsDir, tempDir, args) {

    modsDir = (typeof modsDir == 'string' && modsDir !== '') ? path.fix(modsDir) : 'mods';
    tempDir = (typeof tempDir == 'string' && tempDir !== '') ? path.fix(tempDir) : '';

    let unspecifiedTempDir = !tempDir;
    if (unspecifiedTempDir) {
        tempDir = path.combine(modsDir, defaultTempDir);
    }

    let newModsDir = args.f || args.folder;

    if (!newModsDir) {
        console.log(`Using mods folder "${modsDir}"`);
        console.log(`Using temp folder "${tempDir}"`);
    }
    else {
        if (typeof newModsDir == 'string') {
            modsDir = path.fix(newModsDir);
            console.log(`Using mods folder "${modsDir}"`);
            if (unspecifiedTempDir) {
                tempDir = path.combine(modsDir, defaultTempDir);
            }
        }
        else {
            console.warn(`Couldn't set mods folder "${newModsDir}", using default "${modsDir}"`);
        }
        console.log(`Using temp folder "${tempDir}"`);
    }

    if (!await pfs.accessible(modsDir + '/')) {
        throw `Mods folder "${modsDir}" doesn't exist`;
    }

    return { modsDir, tempDir };
}

function getGameNumber(gameNumber, args) {
    let newGameNumber = args.g || args.game;

    if (newGameNumber !== undefined) {
        gameNumber = newGameNumber;
    }

    gameNumber = Number(gameNumber);

    if (gameNumber !== 1 && gameNumber !== 2) {
        throw `Vermintide ${gameNumber} hasn't been released yet. Check your ${config.filename}.`;
    }

    console.log(`Game: Vermintide ${gameNumber}`);

    return gameNumber;
}

function getTemplateDir(templateDir, args) {
    let newTemplateDir = args.template || '';

    if (newTemplateDir && typeof newTemplateDir == 'string') {
        return newTemplateDir;
    }

    return templateDir;
}

function getTemplateSrc(configCoreSrc, templateDir) {

    // Static files from config
    let coreSrc = [
        path.combine(templateDir, config.itemPreview)
    ];
    if (Array.isArray(configCoreSrc)) {
        for (let src of configCoreSrc) {
            coreSrc.push(path.combine(templateDir, src));
        };
    }

    // Folders with mod specific files
    let modSrc = [
        templateDir + '/**'
    ];

    // Exclude core files from being altered
    for (let src of coreSrc) {
        modSrc.push('!' + src);
    };

    return { coreSrc, modSrc };
}

module.exports = config;