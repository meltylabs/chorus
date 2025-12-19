<p align="center">
  <img src="app-icon.png" alt="Chorus icon" width="128" />
</p>

<h1 align="center"><a href="https://chorus.sh">Chorus</a></h1>

<p align="center">All the AI, on your Mac. Built by the creators of <a href="https://conductor.build">Conductor.</a></p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/771262eb-5a0e-40cb-b1a5-9df6b903c626" alt="Chorus screenshot" />
</p>

# Getting Started

You will need:

1. NodeJS installed and on your path
2. Rust and Cargo installed and on your path (verify with `rustc --version`, `cargo --version`)
3. `imagemagick` (optional)
4. `git-lfs` (`brew install git-lfs`)
5. `pnpm` (`brew install pnpm`)

Once you have those set up, please run:

```bash
git lfs install --force
git lfs pull
pnpm run setup  # This is also our Conductor setup script
pnpm run dev    # This is also our Conductor run script
```

# Nightly Build

You can download the [nightly build here](https://cdn.crabnebula.app/download/chorus/chorus/latest/platform/dmg-aarch64?channel=qa). Every push to main triggers a new build.
