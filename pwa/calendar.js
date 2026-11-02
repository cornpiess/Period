// Expression injected at the CalendarView boundary of the existing Vue bundle.
// The adapter below is the only dependency on its compiled symbol names.
(function createCalendar() {
  // Bail out of compiler block optimizations for this authored render tree.
  const h = (type, props, children) => Er(type, props, children, -2);
  const ref = _t, computed = es, defineComponent = $n;
  const onMounted = eo, onUnmounted = ro;
  const useStore = ec, parseDate = jl, formatDate = Rl, addDays = Fl;
  const daysBetween = Il, today = Nl, isFuture = Ll;
  const css = __PERIOD_CALENDAR_CSS__;
  return defineComponent({
    name: "CalendarView",
    setup() {
      const store = useStore();
      const now = new Date();
      const month = ref(new Date(now.getFullYear(), now.getMonth(), 1));
      // A single mutually exclusive selection drives the range, action and hint.
      const selection = ref({ kind: "idle" });
      const confirmation = ref(null);
      const error = ref("");
      const calendar = ref(null);
      let gesture = null, holdTimer = null, ignoreClickUntil = 0;
      let restoreFocus = null;

      const selectedPeriod = computed(() => {
        const current = selection.value;
        return current.id ? store.periods.find(period => period.id === current.id) : null;
      });
      const draft = computed(() => selection.value.kind === "date"
        ? store.previewPeriod(selection.value.date) : null);
      const visiblePeriods = computed(() => {
        const current = selection.value;
        return store.periods.map(period => current.kind === "drag" && current.id === period.id
          ? Object.assign({}, period, current.draft) : period);
      });
      const days = computed(() => {
        const first = addDays(month.value, -month.value.getDay());
        return Array.from({ length: 42 }, (_, index) => {
          const value = addDays(first, index);
          return { date: formatDate(value), day: value.getDate(),
            current: value.getMonth() === month.value.getMonth() };
        });
      });
      const hint = computed(() => {
        if (error.value) return error.value;
        const current = selection.value;
        if (current.kind === "date") return draft.value.valid
          ? "点＋记录开始，默认 7 天" : draft.value.message;
        if (current.kind === "saved") return "已记录，无需再记录结束";
        if (current.kind === "drag") return describeRange(current.draft);
        if (current.kind === "period" && selectedPeriod.value) return "拖动两端调整，× 删除整段";
        return store.periods.length === 0 ? "点选经期开始那天" : "";
      });

      function describeRange(period) {
        const start = parseDate(period.startDate), end = parseDate(period.endDate);
        const label = value => `${value.getMonth() + 1}月${value.getDate()}日`;
        return `${label(start)}—${label(end)} · ${daysBetween(start, end) + 1}天`;
      }
      function getPeriod(value) {
        return visiblePeriods.value.find(period => value >= period.startDate && value <= period.endDate);
      }
      function stopHold() { clearTimeout(holdTimer); holdTimer = null; }
      function reset() {
        stopHold(); gesture = null; selection.value = { kind: "idle" }; error.value = "";
      }
      function changeMonth(delta) {
        reset();
        month.value = new Date(month.value.getFullYear(), month.value.getMonth() + delta, 1);
      }
      function commit(value) {
        if (store.periods.some(period => period.startDate === value)) return;
        try {
          const result = store.addPeriod(value);
          if (!result.ok) { error.value = result.message; return; }
          selection.value = { kind: "saved", id: result.period.id };
          error.value = "";
        } catch (failure) {
          selection.value = { kind: "date", date: value };
          error.value = "保存失败，记录尚未更改，请重试";
        }
      }
      function selectDay(day) {
        if (Date.now() < ignoreClickUntil || !day.current) return;
        error.value = "";
        const period = getPeriod(day.date);
        if (period) {
          selection.value = selection.value.kind === "period" && selection.value.id === period.id
            ? { kind: "idle" } : { kind: "period", id: period.id };
          return;
        }
        if (isFuture(day.date)) return;
        if (selection.value.kind === "date" && selection.value.date === day.date) commit(day.date);
        else selection.value = { kind: "date", date: day.date };
      }
      function doubleClick(day) {
        if (!day.current || isFuture(day.date) || Date.now() < ignoreClickUntil) return;
        if (!getPeriod(day.date)) commit(day.date);
      }
      function pointerDown(event, day) {
        if (!event.isPrimary || event.button !== 0 || !day.current || confirmation.value) return;
        // A fresh physical gesture must never wait for the synthetic-click guard.
        ignoreClickUntil = 0;
        stopHold();
        const period = getPeriod(day.date);
        const handle = period && (period.startDate === period.endDate ? "single" : day.date === period.startDate ? "start"
          : day.date === period.endDate ? "end" : null);
        if (!period && isFuture(day.date)) return;
        gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
          day, period, handle, moved: false, committed: false };
        if (!period) holdTimer = setTimeout(() => {
          if (!gesture || gesture.moved) return;
          commit(day.date); gesture.committed = true; stopHold();
        }, 500);
      }
      function pointerMove(event) {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
        if (distance < 6 && !gesture.moved) return;
        stopHold(); gesture.moved = true;
        if (!gesture.handle || gesture.committed) return;
        event.preventDefault();
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const cell = hit && hit.closest("[data-date]");
        if (!cell || !calendar.value.contains(cell)) return;
        if (gesture.handle === "single") {
          if (cell.dataset.date === gesture.period.startDate) return;
          gesture.handle = cell.dataset.date < gesture.period.startDate ? "start" : "end";
        }
        if (selection.value.kind !== "drag") {
          error.value = "";
          selection.value = { kind: "drag", id: gesture.period.id, handle: gesture.handle,
            draft: { startDate: gesture.period.startDate, endDate: gesture.period.endDate } };
          calendar.value.setPointerCapture(event.pointerId);
        }
        const result = store.previewPeriodUpdate(gesture.period.id, gesture.handle, cell.dataset.date);
        if (result.valid) {
          selection.value = Object.assign({}, selection.value,
            { draft: { startDate: result.startDate, endDate: result.endDate } });
          error.value = "";
        } else error.value = result.message;
      }
      function releaseCapture(pointerId) {
        if (calendar.value && calendar.value.hasPointerCapture(pointerId)) {
          calendar.value.releasePointerCapture(pointerId);
        }
      }
      function finishGesture(event, cancel) {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        stopHold();
        const current = selection.value;
        const previous = gesture;
        gesture = null;
        if (previous.moved || previous.committed) ignoreClickUntil = Date.now() + 500;
        if (current.kind === "drag") {
          // The store remains untouched throughout a drag, including cancellation.
          selection.value = { kind: "period", id: current.id };
          error.value = "";
          if (!cancel) {
            try {
              const method = current.handle === "start" ? store.setPeriodStart : store.setPeriodEnd;
              const value = current.handle === "start" ? current.draft.startDate : current.draft.endDate;
              if (value !== previous.period[current.handle === "start" ? "startDate" : "endDate"]) {
                const result = method(current.id, value);
                if (!result.ok) error.value = result.message;
              }
            } catch (failure) { error.value = "保存失败，已恢复原日期，请重试"; }
          }
        }
        releaseCapture(event.pointerId);
      }
      function keyDown(event, day) {
        if (event.key === "Escape") {
          if (gesture) finishGesture({ pointerId: gesture.pointerId }, true);
          else reset();
          return;
        }
        if (selection.value.kind !== "period") return;
        const period = selectedPeriod.value;
        if (!period) return;
        const handle = day.date === period.startDate && day.date !== period.endDate ? "start"
          : day.date === period.endDate ? (event.shiftKey ? "start" : "end") : null;
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!handle || !delta) return;
        event.preventDefault(); error.value = "";
        const value = formatDate(addDays(parseDate(day.date), delta));
        try {
          const result = (handle === "start" ? store.setPeriodStart : store.setPeriodEnd)(period.id, value);
          if (!result.ok) { error.value = result.message; return; }
          Promise.resolve().then(() => {
            const cell = calendar.value.querySelector(`[data-date="${value}"]`);
            if (cell) cell.focus();
          });
        } catch (failure) { error.value = "保存失败，已恢复原日期，请重试"; }
      }
      function openDelete() {
        if (!selectedPeriod.value) return;
        restoreFocus = document.activeElement;
        confirmation.value = Object.assign({}, selectedPeriod.value);
        Promise.resolve().then(() => document.getElementById("period-delete-cancel").focus());
      }
      function closeDelete() {
        confirmation.value = null;
        if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus();
      }
      function deletePeriod() {
        try {
          store.removePeriod(confirmation.value.id);
          confirmation.value = null; reset();
          const cell = calendar.value.querySelector('[aria-current="date"]');
          if (cell) cell.focus();
        } catch (failure) { closeDelete(); error.value = "删除未保存，记录仍保留，请重试"; }
      }
      function modalKeyDown(event) {
        if (event.key === "Escape") { event.preventDefault(); closeDelete(); }
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll("button");
        if (event.shiftKey && document.activeElement === buttons[0]) {
          event.preventDefault(); buttons[buttons.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
          event.preventDefault(); buttons[0].focus();
        }
      }

      onMounted(() => {
        if (!document.getElementById("period-calendar-styles")) {
          const style = document.createElement("style");
          style.id = "period-calendar-styles"; style.textContent = css;
          document.head.appendChild(style);
        }
        store.load();
      });
      onUnmounted(() => { stopHold(); gesture = null; });

      function renderDay(day) {
        const period = getPeriod(day.date);
        const preview = draft.value && draft.value.valid && day.date >= draft.value.startDate
          && day.date <= draft.value.endDate;
        const isStart = period && day.date === period.startDate;
        const isEnd = period && day.date === period.endDate;
        const chosen = period && ["period", "drag"].includes(selection.value.kind)
          && selection.value.id === period.id;
        const selected = selection.value.kind === "date" && selection.value.date === day.date;
        const predicted = store.isPredictedDay(day.date) && !period && !preview;
        const endpoint = isStart || isEnd;
        const disabled = !day.current || (isFuture(day.date) && !period);
        const label = day.date + (isStart ? " 经期开始日" : isEnd ? " 经期结束日"
          : period ? " 经期" : predicted ? " 预测经期" : "")
          + (chosen && endpoint ? "，可拖动或用方向键调整日期" : "");
        const classes = ["period-day", period ? "is-period" : "", preview ? "is-preview" : "",
          isStart ? "is-start" : "", isEnd ? "is-end" : "", chosen ? "is-range-selected" : "",
          preview && (day.date === draft.value.startDate || parseDate(day.date).getDay() === 0) ? "is-preview-start" : "",
          preview && (day.date === draft.value.endDate || parseDate(day.date).getDay() === 6) ? "is-preview-end" : "",
          selected ? "is-date-selected" : "", predicted ? "is-predicted" : "",
          !day.current ? "is-other-month" : "", isFuture(day.date) && !period ? "is-future" : ""];
        return h("button", { key: day.date, type: "button", "data-date": day.date,
          class: classes.join(" "), disabled, "aria-label": label,
          "aria-current": day.date === today() ? "date" : null,
          "aria-pressed": !!(selected || chosen),
          style: endpoint && day.current ? { touchAction: "none" } : null,
          onPointerdown: event => pointerDown(event, day),
          onClick: () => selectDay(day), onDblclick: () => doubleClick(day),
          onKeydown: event => keyDown(event, day),
          onContextmenu: event => event.preventDefault(),
        }, [
          h("span", { class: "period-day-number" }, String(day.day)),
          chosen && endpoint ? h("span", { class: "period-range-handle", "aria-hidden": "true" }) : null,
        ]);
      }
      function renderAction() {
        const current = selection.value;
        const add = current.kind === "date";
        const remove = current.kind === "period" && !!selectedPeriod.value;
        return h("div", { class: "period-action-area" }, [
          h("p", { id: "period-context-hint", class: "period-context-hint" + (error.value ? " is-error" : ""),
            role: error.value ? "alert" : "status", "aria-live": "polite", "aria-atomic": "true" }, hint.value),
          add || remove ? h("button", {
            key: add ? "add" : "delete", type: "button",
            class: "period-action" + (remove ? " is-delete" : ""),
            "aria-label": add ? "记录开始" : "删除选中的经期记录",
            "aria-describedby": "period-context-hint",
            disabled: add && !draft.value.valid,
            onClick: add ? () => commit(current.date) : openDelete,
          }, [h("span", { class: "period-action-bar", "aria-hidden": "true" }),
            h("span", { class: "period-action-bar second", "aria-hidden": "true" })]) : null,
        ]);
      }
      return () => h("div", { ref: calendar, class: "calendar-view period-calendar",
        onPointermove: pointerMove, onPointerup: event => finishGesture(event, false),
        onPointercancel: event => finishGesture(event, true),
        onPointerleave: event => {
          if (gesture && selection.value.kind !== "drag") finishGesture(event, true);
        },
        onLostpointercapture: event => {
          // Touch implicitly captures on the pressed day. Its bubbling loss
          // when capture transfers to the calendar is not a cancelled drag.
          if (event.target === calendar.value && gesture) finishGesture(event, true);
        },
      }, [
        h("div", { class: "period-month-header" }, [
          h("button", { type: "button", class: "period-month-button", "aria-label": "上一月",
            onClick: () => changeMonth(-1) }, [Er(fl, { size: 20 })]),
          h("h2", null, `${month.value.getFullYear()}年${month.value.getMonth() + 1}月`),
          h("button", { type: "button", class: "period-month-button", "aria-label": "下一月",
            onClick: () => changeMonth(1) }, [Er(hl, { size: 20 })]),
        ]),
        h("div", { class: "period-weekdays", "aria-hidden": "true" },
          ["日", "一", "二", "三", "四", "五", "六"].map((label, index) =>
            h("span", { class: index === 0 || index === 6 ? "is-weekend" : "" }, label))),
        h("div", { class: "period-days", role: "group", "aria-label": "经期日历" }, days.value.map(renderDay)),
        h("div", { class: "period-legend", "aria-hidden": "true" }, [
          h("span", { class: "period-legend-item" }, [h("i", { class: "recorded" }), "已记录经期"]),
          h("span", { class: "period-legend-item" }, [h("i", { class: "predicted" }), "预测经期"]),
        ]),
        renderAction(),
        confirmation.value ? h(An, { to: "body" }, [h("div", { class: "period-modal-overlay",
          onClick: event => { if (event.target === event.currentTarget) closeDelete(); } }, [
          h("div", { class: "period-delete-dialog", role: "dialog", "aria-modal": "true",
            "aria-labelledby": "period-delete-title", "aria-describedby": "period-delete-description",
            onKeydown: modalKeyDown }, [
            h("h3", { id: "period-delete-title" }, "删除经期记录"),
            h("p", { id: "period-delete-description" },
              `确定要删除 ${describeRange(confirmation.value)} 这段记录吗？删除后不可恢复。`),
            h("div", { class: "period-delete-actions" }, [
              h("button", { id: "period-delete-cancel", type: "button", onClick: closeDelete }, "取消"),
              h("button", { type: "button", class: "confirm", onClick: deletePeriod }, "确认删除"),
            ]),
          ]),
        ])]) : null,
      ]);
    },
  });
})()
