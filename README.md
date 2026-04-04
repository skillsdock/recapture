> [!WARNING]
> This is very much in beta and might be buggy here and there (but hope you have a good experience!).

<p align="center">
  <img src="public/recapture.png" alt="Recapture Logo" width="64" />
  <br />
  <br />
  <a href="https://github.com/skillsdock/recapture">
    <img src="https://img.shields.io/github/stars/skillsdock/recapture?style=social" alt="GitHub Stars" />
  </a>
</p>

# <p align="center">Recapture</p>

<p align="center"><strong>Recapture is your free, open-source alternative to Screen Studio (sort of).</strong></p>

If you don't want to pay $29/month for Screen Studio but want a much simpler version that does what most people seem to need, making beautiful product demos and walkthroughs, here's a free-to-use app for you. Recapture does not offer all Screen Studio features, but covers the basics well!

Screen Studio is an awesome product and this is definitely not a 1:1 clone. Recapture is a much simpler take, just the basics for folks who want control and don't want to pay. If you need all the fancy features, your best bet is to support Screen Studio (they really do a great job, haha). But if you just want something free (no gotchas) and open, this project does the job!

Recapture is 100% free for personal and commercial use. Use it, modify it, distribute it. (Just be cool 😁 and give a shoutout if you feel like it !)

<p align="center">
	<img src="public/preview3.png" alt="Recapture App Preview 3" style="height: 320px; margin-right: 12px;" />
	<img src="public/preview4.png" alt="Recapture App Preview 4" style="height: 320px; margin-right: 12px;" />
</p>

## Core Features
- Record your whole screen or specific windows.
- Add Automatic zooms or manual zooms (customizable depth levels).
- Record microphone audio and system audio capture.
- Customize the duration and position of zooms however you please.
- Crop video recordings to hide parts.
- Choose between wallpapers, solid colors, gradients or a custom background.
- Motion blur for smoother pan and zoom effects.
- Add annotations (text, arrows, images).
- Trim sections of the clip.
- Customize speed at different segments.
- Export in different aspect ratios and resolutions.

## Installation

Download the latest installer for your platform from the [GitHub Releases](https://github.com/skillsdock/recapture/releases) page.

### macOS

If you encounter issues with macOS Gatekeeper blocking the app (since it does not come with a developer certificate), you can bypass this by running the following command in your terminal after installation:

```bash
xattr -rd com.apple.quarantine /Applications/Recapture.app
```

Note: Give your terminal Full Disk Access in **System Settings > Privacy & Security** to grant you access and then run the above command.

After running this command, proceed to **System Preferences > Security & Privacy** to grant the necessary permissions for "screen recording" and "accessibility". Once permissions are granted, you can launch the app.

### Linux

Download the `.AppImage` file from the releases page. Make it executable and run:

```bash
chmod +x Recapture-Linux-*.AppImage
./Recapture-Linux-*.AppImage
```

You may need to grant screen recording permissions depending on your desktop environment.

**Note:** If the app fails to launch due to a "sandbox" error, run it with --no-sandbox:
```bash
./Recapture-Linux-*.AppImage --no-sandbox
```

### Limitations

System audio capture relies on Electron's [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer) and has some platform-specific quirks:

- **macOS**: Requires macOS 13+. On macOS 14.2+ you'll be prompted to grant audio capture permission. macOS 12 and below does not support system audio (mic still work).
- **Windows**: Works out of the box.
- **Linux**: Needs PipeWire (default on Ubuntu 22.04+, Fedora 34+). Older PulseAudio-only setups may not support system audio (mic should still works).

## Built with
- Electron
- React
- TypeScript
- Vite
- PixiJS
- dnd-timeline

---

_I'm new to open source, idk what I'm doing lol. If something is wrong please raise an issue 🙏_

## Contributing

Contributions are welcome! If you’d like to help out or see what’s currently being worked on, take a look at the open issues to understand the current direction of the project and find ways to contribute.

## License

This project is licensed under the [MIT License](./LICENSE). By using this software, you agree that the authors are not liable for any issues, damages, or claims arising from its use.
