import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import { StatusBar } from 'expo-status-bar';

// PWA 静态文件清单（从 Expo 包复制到设备可访问目录）
const ASSET_FILES = {
  'index.html': require('./assets/www/index.html'),
  'favicon.png': require('./assets/www/favicon.png'),
  'icon-192.png': require('./assets/www/icon-192.png'),
  'icon-512.png': require('./assets/www/icon-512.png'),
  'icon-512-maskable.png': require('./assets/www/icon-512-maskable.png'),
  'apple-touch-icon.png': require('./assets/www/apple-touch-icon.png'),
  'manifest.webmanifest': require('./assets/www/manifest.webmanifest'),
  'sw.js': require('./assets/www/sw.js'),
  'assets/index-legacy-eCmZKwFb.js': require('./assets/www/assets/index-legacy-eCmZKwFb.js'),
  'assets/polyfills-legacy-DI84a8Gu.js': require('./assets/www/assets/polyfills-legacy-DI84a8Gu.js'),
};

const WWW_DIR = `${FileSystem.documentDirectory}period-www/`;

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    prepareAssets();
  }, []);

  async function prepareAssets() {
    try {
      // 清理旧副本 → 确保每次启动加载最新文件
      await FileSystem.deleteAsync(WWW_DIR, { idempotent: true });
      await FileSystem.makeDirectoryAsync(WWW_DIR, { intermediates: true });

      // 逐个复制 PWA 文件到设备文档目录
      for (const [relPath, moduleRef] of Object.entries(ASSET_FILES)) {
        const asset = Asset.fromModule(moduleRef);
        await asset.downloadAsync();

        const destPath = WWW_DIR + relPath;
        const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
        await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
        await FileSystem.copyAsync({ from: asset.localUri, to: destPath });
      }

      console.log('✅ PWA 资产就绪:', WWW_DIR);
      setReady(true);
    } catch (err) {
      console.error('❌ 准备 PWA 资产失败:', err);
      setError(err.message);
      setReady(true); // 仍然尝试加载
    }
  }

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={styles.loadingText}>Period 加载中...</Text>
      </View>
    );
  }

  const localUri = `${WWW_DIR}index.html`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}
      <WebView
        source={{ uri: localUri }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // 加载进度指示
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color="#E91E63" />
          </View>
        )}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent.description);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('HTTP error:', nativeEvent.statusCode);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#888',
  },
  errorBar: {
    backgroundColor: '#FFF3F3',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFCDD2',
  },
  errorText: {
    color: '#C62828',
    fontSize: 12,
    textAlign: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});