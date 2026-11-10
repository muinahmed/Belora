# Kinetic Fitness Tracker

A health and fitness website for a university project. It is separate from the Bellora shop in the rest of this repository and shares no code with it.

Built with plain HTML, CSS and JavaScript. There is no framework, no build step and no server: everything a visitor logs is saved in their own browser with `localStorage`.

## Run it

Open `index.html` in a browser. That is all.

To serve it locally instead (any static server works):

```sh
cd fitness-site
python3 -m http.server 8000
# then open http://localhost:8000
```

To put it online, upload the three files to any static host (GitHub Pages, Netlify, Vercel).

## Pages

| Page | Address | What it does |
|---|---|---|
| Home | `#home` | Today's workout, calorie ring, steps, water, active time, popular exercises, meal ideas |
| Food diary | `#diary` | Pick a day, log food by meal, see protein / carbs / fat against targets, track water |
| Activity | `#activity` | Step counter with distance, calories and time; 7-day chart for steps, calories eaten and burned |
| Workouts | `#workout` | Four workouts split into rounds; tick off exercises and watch progress |
| Recipes | `#recipes` | Six recipes with ingredients, directions and one-tap "add to diary" |
| Plans | `#plans` | Free and Pro pricing cards (demo only, no payment) |
| Profile | `#profile` | Personal details, BMI, daily calorie budget and macro targets |

The first visit shows example data so every page has something on it. **Start fresh** clears it.

## Files

```
fitness-site/
├── index.html     page shell: sidebar, top bar, bottom tab bar, dialog
├── css/style.css  all styling, colour tokens, light and dark themes, responsive layout
└── js/app.js      data, calculations, page rendering, actions, routing
```

`js/app.js` is split into nine numbered sections (data, storage, calculations, drawing helpers, pages, dialogs, chart, actions, start-up) so each part is easy to find and explain.

## How the numbers are worked out

- **Calorie budget:** Mifflin-St Jeor resting energy (`10 × kg + 6.25 × cm − 5 × age + 5` for men, `− 161` for women) × activity level, then −500 kcal to lose weight or +300 kcal to gain. Never below 1,200 kcal.
- **Macro targets:** 25% of calories from protein, 50% from carbs, 25% from fat (4, 4 and 9 kcal per gram).
- **BMI:** weight in kg ÷ (height in m)².
- **Steps:** stride length is taken as 41.5% of height; calories as 0.04 kcal per step for a 70 kg person, scaled by weight; time as 110 steps a minute.

These are standard estimates for a student project, not medical advice.

## Design

- Font: Manrope (Google Fonts).
- Colours: purple `#8524DC`, orange `#FB6D37`, teal `#00CFC3`, yellow `#FDC102`.
- Phone layout has a bottom tab bar; screens 960px and wider get a sidebar.
- Follows the device's light or dark setting.

## Change the name

Search for `Kinetic` in `index.html` and `js/app.js` and replace it with your own.

## Not included

- No sign in or accounts. Data stays in one browser; a real login needs a server and a database.
- No real payments on the Plans page.
- Steps are typed in by hand; a website cannot read a phone's step counter.
