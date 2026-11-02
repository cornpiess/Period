// Factory injected into the existing Pinia store by patch-pwa.js.
// Preview and commit deliberately use the same inclusive date-range validation.
(function createPeriodActions(records, save, date) {
  function range(startDate, endDate, exceptId) {
    const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && date.format(date.parse(value)) === value;
    if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
      return { valid: false, message: "请检查起止日期" };
    }
    if (date.isFuture(startDate)) return { valid: false, message: "请选择今天或之前的开始日期" };
    if (records.value.some(period => period.id !== exceptId
      && startDate <= period.endDate && endDate >= period.startDate)) {
      return { valid: false, message: "日期与已有经期重叠，请调整日期" };
    }
    return { valid: true, startDate, endDate };
  }
  function previewPeriod(startDate) {
    return range(startDate, date.format(date.add(date.parse(startDate), 6)));
  }
  function previewPeriodUpdate(id, handle, value) {
    const period = records.value.find(item => item.id === id);
    if (!period) return { valid: false, message: "这条记录已不存在" };
    return range(handle === "start" ? value : period.startDate,
      handle === "end" ? value : period.endDate, id);
  }
  function update(id, handle, value) {
    const draft = previewPeriodUpdate(id, handle, value);
    if (!draft.valid) return { ok: false, message: draft.message };
    const next = records.value.map(period => period.id === id
      ? Object.assign({}, period, { startDate: draft.startDate, endDate: draft.endDate }) : period);
    save(next);
    return { ok: true, period: next.find(period => period.id === id) };
  }
  return {
    previewPeriod,
    previewPeriodUpdate,
    addPeriod(startDate) {
      const draft = previewPeriod(startDate);
      if (!draft.valid) return { ok: false, message: draft.message };
      const period = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        startDate: draft.startDate, endDate: draft.endDate };
      // save() publishes reactive state only after durable storage succeeds.
      save(records.value.concat(period));
      return { ok: true, period };
    },
    setPeriodStart(id, value) { return update(id, "start", value); },
    setPeriodEnd(id, value) { return update(id, "end", value); },
    removePeriod(id) { save(records.value.filter(period => period.id !== id)); },
  };
})
