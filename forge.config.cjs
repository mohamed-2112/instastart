const path = require('node:path');
module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'InstaStart',
    icon: path.join(__dirname, 'assets', 'instastart'),
    extraResource: [path.join(__dirname, 'assets')],
    appBundleId: 'app.instastart.desktop',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: { name: 'InstaStart', setupIcon: path.join(__dirname, 'assets', 'instastart.ico') },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32', 'linux'] },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.cjs',
        devContentSecurityPolicy:
          "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*",
        renderer: {
          config: './webpack.renderer.cjs',
          entryPoints: [
            {
              name: 'main_window',
              html: './src/ui/index.html',
              js: './src/ui/main.tsx',
              preload: { js: './src/desktop/preload.ts' },
            },
          ],
        },
      },
    },
  ],
};
