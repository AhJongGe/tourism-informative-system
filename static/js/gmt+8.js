// openStatus.js

/**
 * Returns an object: { status: "...", nextEvent: "open"/"close"/null }
 * @param {Object} hoursObj - e.g. { mon: "11:00-23:00", ... }
 * @returns {Object}
 */
function getOpenStatus(hoursObj) {
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const now = dayjs().tz('Asia/Kuching'); // GMT+8
  const day = days[now.day()];
  const todayHours = hoursObj[day];

  if (!todayHours || todayHours.toLowerCase() === 'closed') {
    return { status: '', countdown: '', isOpen: false };
  }

  const [openStr, closeStr] = todayHours.split('-');
  if (!openStr || !closeStr) return { status: '', countdown: '', isOpen: false };

  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  const openTime = now.clone().hour(openH).minute(openM).second(0);
  const closeTime = now.clone().hour(closeH).minute(closeM).second(0);

  if (now.isBefore(openTime)) {
    const diff = openTime.diff(now, 'minute');
    if (diff <= 120) {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      let countdown = '';
      if (h > 0) countdown += `${h} hr`;
      if (h > 0 && m > 0) countdown += ' & ';
      if (m > 0) countdown += `${m} min`;
      return { status: '', countdown: `Opening in ${countdown}`, isOpen: false };
    }
    return { status: '', countdown: '', isOpen: false };
  } else if (now.isAfter(openTime) && now.isBefore(closeTime)) {
    const diff = closeTime.diff(now, 'minute');
    if (diff <= 120) {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      let countdown = '';
      if (h > 0) countdown += `${h} hr`;
      if (h > 0 && m > 0) countdown += ' & ';
      if (m > 0) countdown += `${m} min`;
      return { status: '', countdown: `Closing in ${countdown}`, isOpen: true };
    }
    return { status: '', countdown: '', isOpen: true };
  } else {
    return { status: '', countdown: '', isOpen: false };
  }
}