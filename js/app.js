// Entry point: loads state, routes between screens, draws the tab bar.
import { S, loadState } from './state.js';
import { icon } from './icons.js';
import { renderProgress, renderMore, renderOnboarding, handleSync } from './views.js';
import { renderHome, renderTraining, renderTrainingDay, renderWeekEdit } from './plan-views.js';
import { renderActivity, leaveActivity } from './run.js';
import { renderFood } from './food.js';
import { renderPlayer, leaveWorkout } from './workout.js';
import { keepAwake } from './ui.js';

const TABS = [
  { route: '#/heute', label: 'Heute', icon: 'house' },
  { route: '#/training', label: 'Training', icon: 'dumbbell' },
  { route: '#/essen', label: 'Essen', icon: 'utensils' },
  { route: '#/fortschritt', label: 'Fortschritt', icon: 'chart-line' },
  { route: '#/mehr', label: 'Mehr', icon: 'user' },
];

function parseHash() {
  const raw = location.hash || '#/heute';
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path, params, parts: path.replace(/^#\//, '').split('/') };
}

function tabBar(active) {
  return TABS.map(
    (t) => `<a href="${t.route}" class="tab${active === t.route ? ' on' : ''}" ${active === t.route ? 'aria-current="page"' : ''}>${icon(t.icon, 20)}<span>${t.label}</span></a>`,
  ).join('');
}

async function route() {
  const view = document.getElementById('view');
  const nav = document.getElementById('tabs');
  const { path, params, parts } = parseHash();

  if (parts[0] === 'sync') {
    if (S.plan) { await handleSync(params); return; }
  }

  const inWorkout = parts[0] === 'workout' || parts[0] === 'einheit';
  if (parts[0] !== 'workout') leaveWorkout();
  if (parts[0] !== 'einheit') leaveActivity();
  document.body.classList.toggle('in-workout', inWorkout);
  if (!inWorkout) keepAwake(false);

  if (!S.plan) {
    nav.hidden = true;
    renderOnboarding(view);
    return;
  }
  nav.hidden = inWorkout;

  const tab = `#/${parts[0] || 'heute'}`;
  const tabFor = { '#/woche': '#/training', '#/einheit': '#/training' };
  nav.innerHTML = tabBar(TABS.some((t) => t.route === tab) ? tab : tabFor[tab] || '#/heute');

  switch (parts[0]) {
    case 'workout': renderPlayer(view); break;
    case 'einheit': renderActivity(view, parts[1]); break;
    case 'woche': renderWeekEdit(view); break;
    case 'training':
      if (parts[1]) renderTrainingDay(view, parts[1], params);
      else renderTraining(view, params);
      break;
    case 'essen': renderFood(view); break;
    case 'fortschritt': await renderProgress(view, params); break;
    case 'mehr': renderMore(view, params); break;
    default: renderHome(view);
  }
  if (!inWorkout) window.scrollTo(0, 0);
  const anchor = params.habits ? 'habit-manage' : params.saison ? 'saison' : null;
  if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  void path;
}

async function start() {
  await loadState();
  window.addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Re-render the home screen when coming back to the app, so coach and date stay current
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.body.classList.contains('in-workout')) route();
  });
}

start();
