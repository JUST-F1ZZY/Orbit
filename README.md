<p align="center">
  <img src="docs/icon.png" width="96" alt="Orbit icon">
</p>

<h1 align="center">Orbit</h1>

<p align="center">
  A period tracker that keeps everything on your phone.<br>
  No account, no server, no analytics.
</p>

<p align="center">
  <a href="https://just-f1zzy.github.io/Orbit/">Open the app</a> ·
  <a href="#install">Install</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="https://ko-fi.com/fizzyyy052326">Support</a>
</p>

<p align="center">
  <img src="docs/screenshot-today.png" width="230" alt="Today screen">
  <img src="docs/screenshot-calendar.png" width="230" alt="Calendar screen">
  <img src="docs/screenshot-insights.png" width="230" alt="Insights screen">
</p>

Early beta. It works, but not many people have used it yet, so please report bugs.

## Why

A lot of period apps send your data to their servers, and some share it with advertisers. Since Roe v. Wade got overturned, that data can also end up in court. Orbit doesn't have a server, so there's nothing to sell or hand over. You don't have to take my word for it, the code is all here.

## Features

- Log period days, flow, symptoms (mild/moderate/severe), mood, energy and notes
- One-tap "period started" / "period ended"
- Current phase and when your next period is likely
- Predictions that adjust to your own cycle the more you log, with a confidence level
- Symptom forecast for the next week, based on your past cycles
- Insights: average cycle, how much it varies, symptoms by phase
- Optional PIN lock
- Export/import backups
- Works offline

## How predictions work

All of it is in [`src/cycle.js`](src/cycle.js), tests are in [`tests/cycle.test.js`](tests/cycle.test.js).

- Cycle length is a weighted average of the gaps between period starts. Recent cycles count more. Until you've logged a couple, it uses the numbers from settings (28/5 by default).
- The date range comes from how much your cycles vary.
- Ovulation is just estimated as 14 days before the next period. It's an average, not a measurement, so don't use it to plan or avoid pregnancy.
- Symptoms get forecast if they showed up around the same point in at least half your past cycles. Needs 2 logged cycles first.
- Gaps over 60 days are treated as missed logging and ignored.

## Privacy

- Data is stored in IndexedDB on your device. Nothing in the code sends it anywhere (search for `fetch(` if you want to check).
- No analytics, ads, or third-party SDKs. The only dependencies are Vite and vite-plugin-pwa, see `package.json`.
- A Content-Security-Policy in `index.html` blocks requests to any other server.
- No account, so no email or password.

The downside: if you lose your phone or clear browser data without a backup, your data is gone and I can't get it back. Use Settings → Export every so often.

## Install

It's a web app you add to your home screen.

- **Android:** open the link, then browser menu → Install app
- **iPhone:** open it in Safari, then Share → Add to Home Screen. Do this instead of bookmarking it, because Safari can delete website data after 7 days of not using it.
- **F-Droid:** planned

## Not medical advice

Predictions are estimates from your own logs. **Don't use Orbit as birth control.** If something about your cycle changes or worries you, talk to a doctor.

## About

I'm Hunter, a student into cybersecurity. I built Orbit with help from AI coding tools, and I review what goes in. Since it's all open source, you can check everything yourself.

If something's confusing or missing, [open an issue](../../issues).

## Running it locally

```bash
git clone https://github.com/JUST-F1ZZY/Orbit.git
cd Orbit
npm install
npm run dev
npm test
```

## Contributing

Bug reports, design feedback, translations and code are welcome. I won't merge anything that adds network calls, analytics or tracking.

## Support

Orbit is free with no ads. Tips are the only funding and go toward app store fees (Apple is $99/year) and the time I put into it. [Ko-fi](https://ko-fi.com/fizzyyy052326) if you want to help.

## License

[GPL-3.0](LICENSE)
