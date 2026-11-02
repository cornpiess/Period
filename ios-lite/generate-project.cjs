const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const id = name => crypto.createHash('sha256').update(name).digest('hex').slice(0, 24).toUpperCase();
const q = value => JSON.stringify(value);
const files = ['AppDelegate.swift', 'RecordStore.swift', 'bridge.js', 'Assets.xcassets', 'www'];
const objects = [];
const add = (name, body) => { objects.push(`${id(name)} = { ${body} };`); return id(name); };
const refs = files.map(name => add('ref-' + name, `isa = PBXFileReference; path = ${q(name)}; sourceTree = "<group>"; lastKnownFileType = ${name.endsWith('.swift') ? 'sourcecode.swift' : name.endsWith('.js') ? 'sourcecode.javascript' : name.endsWith('.xcassets') ? 'folder.assetcatalog' : 'folder'};`));
const builds = files.map(name => add('build-' + name, `isa = PBXBuildFile; fileRef = ${id('ref-' + name)};`));
const sourcePhase = add('sources', `isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${builds.slice(0, 2).join(',')}); runOnlyForDeploymentPostprocessing = 0;`);
const resourcePhase = add('resources', `isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (${builds.slice(2).join(',')}); runOnlyForDeploymentPostprocessing = 0;`);
const frameworkPhase = add('frameworks', 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;');
const product = add('product', 'isa = PBXFileReference; explicitFileType = wrapper.application; path = Period.app; sourceTree = BUILT_PRODUCTS_DIR;');
const productGroup = add('products', `isa = PBXGroup; name = Products; children = (${product}); sourceTree = "<group>";`);
const appGroup = add('app-group', `isa = PBXGroup; path = Period; children = (${refs.join(',')}); sourceTree = "<group>";`);
const mainGroup = add('main-group', `isa = PBXGroup; children = (${appGroup},${productGroup}); sourceTree = "<group>";`);
const configurations = ['Debug', 'Release'].map(name => {
  const settings = {
    SDKROOT: 'iphoneos', IPHONEOS_DEPLOYMENT_TARGET: '15.0', SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '1,2', PRODUCT_BUNDLE_IDENTIFIER: 'com.cornpiess.period',
    PRODUCT_NAME: 'Period', INFOPLIST_FILE: 'Period/Info.plist', CODE_SIGN_STYLE: 'Automatic',
    MARKETING_VERSION: '1.0.1', CURRENT_PROJECT_VERSION: process.env.BUILD_NUMBER || '20',
    ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon', SWIFT_OPTIMIZATION_LEVEL: name === 'Release' ? '-O' : '-Onone',
    SWIFT_COMPILATION_MODE: name === 'Release' ? 'wholemodule' : 'singlefile',
    SWIFT_ACTIVE_COMPILATION_CONDITIONS: name === 'Debug' ? 'DEBUG' : '',
    DEAD_CODE_STRIPPING: 'YES', ENABLE_BITCODE: 'NO', CLANG_ENABLE_MODULES: 'YES',
    GENERATE_INFOPLIST_FILE: 'NO', DEBUG_INFORMATION_FORMAT: 'dwarf-with-dsym',
    SUPPORTS_MACCATALYST: 'NO', LD_RUNPATH_SEARCH_PATHS: '$(inherited) @executable_path/Frameworks',
    DEVELOPMENT_TEAM: process.env.TEAM_ID || '',
  };
  return add('config-' + name, `isa = XCBuildConfiguration; name = ${name}; buildSettings = { ${Object.entries(settings).map(([k,v]) => `${k} = ${q(v)};`).join(' ')} };`);
});
const list = add('configuration-list', `isa = XCConfigurationList; buildConfigurations = (${configurations.join(',')}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;`);
const target = add('target', `isa = PBXNativeTarget; name = Period; productName = Period; productType = "com.apple.product-type.application"; productReference = ${product}; buildConfigurationList = ${list}; buildPhases = (${sourcePhase},${frameworkPhase},${resourcePhase}); buildRules = (); dependencies = ();`);
const project = add('project', `isa = PBXProject; attributes = { LastUpgradeCheck = 1600; }; buildConfigurationList = ${list}; compatibilityVersion = "Xcode 14.0"; developmentRegion = "zh-Hans"; knownRegions = ("zh-Hans",en,Base); mainGroup = ${mainGroup}; productRefGroup = ${productGroup}; projectDirPath = ""; projectRoot = ""; targets = (${target});`);
const projectDir = path.join(root, 'Period.xcodeproj');
fs.mkdirSync(path.join(projectDir, 'xcshareddata/xcschemes'), { recursive: true });
fs.writeFileSync(path.join(projectDir, 'project.pbxproj'), `// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n${objects.join('\n')}\n}; rootObject = ${project}; }\n`);
fs.writeFileSync(path.join(projectDir, 'xcshareddata/xcschemes/Period.xcscheme'), `<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target}" BuildableName="Period.app" BlueprintName="Period" ReferencedContainer="container:Period.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug"/><ProfileAction buildConfiguration="Release"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>`);
const www = path.join(root, 'Period/www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(root, '../assets/www'), www, { recursive: true });
const index = path.join(www, 'index.html');
let html = fs.readFileSync(index, 'utf8').replace(/\s*<link[^>]*https:\/\/fonts\.[^>]*>/g, '');
html = html.replace('<meta charset="UTF-8"', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob: \'unsafe-inline\' \'unsafe-eval\'; connect-src \'none\';"><meta charset="UTF-8"');
fs.writeFileSync(index, html);
console.log('Generated dependency-free native iOS project.');
