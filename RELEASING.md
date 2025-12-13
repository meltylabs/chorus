# Releasing Chorus

## Quick Start

To release a new version of Chorus:

```bash
pnpm run release
```

That's it!

## What Happens

The release script (`script/release.sh`) does the following:

1. Runs TypeScript compilation to check for errors
2. Checks out `main` and pulls the latest changes
3. Checks out the `release` branch
4. Pulls `main` into `release` (fast-forward merge)
5. Pushes `release` to GitHub
6. Switches back to `main`

Once the `release` branch is pushed, GitHub Actions automatically:

1. Creates a draft release on CrabNebula Cloud
2. Builds the app for both Intel (`x86_64`) and Apple Silicon (`aarch64`) Macs
3. Signs and notarizes the app with Apple
4. Uploads the build artifacts to CrabNebula Cloud. Only maintainers have access.

Next, you need to publish the release on CrabNebula Cloud:

## Publishing

1. Go to the draft release on [CrabNebula Cloud](https://web.crabnebula.cloud/chorus/chorus)
2. Click "Publish release"

## Monitoring

Check release status at: https://github.com/meltylabs/chorus-oss/actions
