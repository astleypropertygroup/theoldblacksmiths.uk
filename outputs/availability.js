(function () {
  const grid = document.querySelector("[data-calendar-grid]");
  const title = document.querySelector("[data-calendar-title]");
  const status = document.querySelector("[data-calendar-status]");
  const prev = document.querySelector("[data-calendar-prev]");
  const next = document.querySelector("[data-calendar-next]");
  const selectedStay = document.querySelector("[data-selected-stay]");
  const selectedDates = document.querySelector("[data-selected-dates]");
  const selectedLink = document.querySelector("[data-selected-link]");

  if (!grid || !title || !status || !prev || !next) return;

  const today = stripTime(new Date());
  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let blockedRanges = [];
  let selectedStart = null;
  let selectedEnd = null;

  function stripTime(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function monthLabel(date) {
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function displayDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }

  function isBlocked(date) {
    const iso = toISODate(date);
    return blockedRanges.some((range) => iso >= range.start && iso < range.end);
  }

  function isPast(date) {
    return stripTime(date) < today;
  }

  function hasBlockedDateBetween(startIso, endIso) {
    const [startYear, startMonth, startDay] = startIso.split("-").map(Number);
    const [endYear, endMonth, endDay] = endIso.split("-").map(Number);
    const cursor = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    while (cursor <= endDate) {
      if (isBlocked(cursor)) return true;
      cursor.setDate(cursor.getDate() + 1);
    }

    return false;
  }

  function isSelected(iso) {
    return iso === selectedStart || iso === selectedEnd;
  }

  function isInSelectedRange(iso) {
    return selectedStart && selectedEnd && iso > selectedStart && iso < selectedEnd;
  }

  function updateSelectedStay() {
    if (!selectedStay || !selectedDates || !selectedLink) return;

    if (!selectedStart) {
      selectedStay.hidden = true;
      return;
    }

    selectedStay.hidden = false;

    if (!selectedEnd) {
      selectedDates.textContent = `Arrival: ${displayDate(selectedStart)}. Now choose your leaving date.`;
      selectedLink.hidden = true;
      return;
    }

    selectedDates.textContent = `${displayDate(selectedStart)} to ${displayDate(selectedEnd)}`;
    selectedLink.hidden = false;
    selectedLink.href = `mailto:info@astleypropertygroup.co.uk?subject=The%20Old%20Blacksmiths%20date%20request&body=Hello,%0D%0A%0D%0AI%20would%20like%20to%20stay%20at%20The%20Old%20Blacksmiths%20from%20${encodeURIComponent(displayDate(selectedStart))}%20to%20${encodeURIComponent(displayDate(selectedEnd))}.%0D%0A%0D%0AGuest%20count:%20%0D%0A%0D%0AThank%20you.`;
  }

  function selectDate(iso) {
    if (!selectedStart || selectedEnd || iso <= selectedStart) {
      selectedStart = iso;
      selectedEnd = null;
      status.textContent = "Arrival selected. Now choose your leaving date.";
      updateSelectedStay();
      renderCalendar();
      return;
    }

    if (hasBlockedDateBetween(selectedStart, iso)) {
      selectedStart = iso;
      selectedEnd = null;
      status.textContent = "That stay includes an unavailable date. Choose another leaving date.";
      updateSelectedStay();
      renderCalendar();
      return;
    }

    selectedEnd = iso;
    status.textContent = "Dates selected. Use the button below to request them.";
    updateSelectedStay();
    renderCalendar();
  }

  function renderCalendar() {
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    const startOffset = (monthStart.getDay() + 6) % 7;
    const cells = [];

    title.textContent = monthLabel(visibleMonth);
    grid.innerHTML = "";

    for (let i = startOffset; i > 0; i -= 1) {
      cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - i));
    }

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
    }

    while (cells.length % 7 !== 0) {
      cells.push(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + (cells.length % 7 === 0 ? 0 : cells.length - startOffset - monthEnd.getDate() + 1)));
    }

    cells.forEach((date) => {
      const cell = document.createElement("button");
      const iso = toISODate(date);
      const muted = date.getMonth() !== visibleMonth.getMonth();
      const booked = isBlocked(date);
      const past = isPast(date);
      const isToday = toISODate(date) === toISODate(today);

      cell.className = [
        "calendar-day",
        muted ? "is-muted" : "",
        booked ? "is-booked" : "",
        past ? "is-disabled" : "",
        isToday ? "is-today" : "",
        isSelected(iso) ? "is-selected" : "",
        isInSelectedRange(iso) ? "is-in-range" : "",
      ].filter(Boolean).join(" ");
      cell.type = "button";
      cell.disabled = booked || past;
      cell.dataset.date = iso;
      cell.textContent = date.getDate();
      cell.setAttribute("aria-label", `${iso} ${booked ? "unavailable" : past ? "past date" : "available"}`);
      cell.setAttribute("aria-pressed", isSelected(iso) || isInSelectedRange(iso) ? "true" : "false");
      grid.appendChild(cell);
    });

    updateSelectedStay();
  }

  async function loadAvailability() {
    renderCalendar();

    try {
      const response = await fetch("/api/availability", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Availability feed unavailable");

      const data = await response.json();
      blockedRanges = Array.isArray(data.blockedRanges) ? data.blockedRanges : [];
      const sourceCount = Array.isArray(data.sources) ? data.sources.length : 0;
      status.textContent = sourceCount
        ? `Updated from ${sourceCount} connected calendar${sourceCount === 1 ? "" : "s"}.`
        : "No live calendar feeds are connected yet.";
    } catch (error) {
      status.textContent = "Live availability is not connected in this preview. Enquire to confirm dates.";
    }

    renderCalendar();
  }

  prev.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  next.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  grid.addEventListener("click", (event) => {
    const day = event.target.closest("[data-date]");
    if (!day || day.disabled) return;
    selectDate(day.dataset.date);
  });

  loadAvailability();
})();
