const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// PWA 静态文件（index.html / manifest.webmanifest）需要作为原始资产打包，
// WebView 壳会按文件逐个复制到设备目录；sw.js 以 .txt 后缀参与打包避免被当作 JS 源码
config.resolver.assetExts.push('html', 'webmanifest', 'txt');

module.exports = config;
