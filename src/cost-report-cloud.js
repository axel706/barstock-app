(() => {
  if (window.BarStockCostReportCloud) return;

  function getConfig() {
    const config = window.BARSTOCK_CONFIG || {};
    return {
      url: config.SUPABASE_URL,
      key: config.SUPABASE_KEY,
      accountId: config.ACCOUNT_ID || 'wjm-hospitality',
      locationName: config.LOCATION_NAME || 'The Crown Tavern'
    };
  }

  async function fetchLocationId() {
    const { url, key, accountId, locationName } = getConfig();
    const res = await fetch(
      `${url}/rest/v1/locations?account_id=eq.${encodeURIComponent(accountId)}&name=eq.${encodeURIComponent(locationName)}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const data = await res.json();
    const locationId = data?.[0]?.id;
    if (!locationId) throw new Error(`Could not find ${locationName} location`);
    return locationId;
  }

  // Listar todos los reportes de la locación actual (más recientes primero)
  async function listReports() {
    const { url, key, locationName } = getConfig();
    const locationId = await fetchLocationId();
    const res = await fetch(
      `${url}/rest/v1/cost_reports?location_id=eq.${locationId}&order=period_to.desc,created_at.desc&select=*`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error('Failed to list cost reports');
    return await res.json();
  }

  // Guardar un reporte nuevo
  async function saveReport(report) {
    const { url, key, locationName } = getConfig();
    const locationId = await fetchLocationId();
    const payload = {
      location_id: locationId,
      location_name: locationName,
      period_from: report.periodFrom,
      period_to: report.periodTo,
      vendors: report.vendors || [],
      total_wine: report.totalWine || 0,
      total_liquor: report.totalLiquor || 0,
      wine_sales: report.wineSales || 0,
      liquor_sales: report.liquorSales || 0,
      wine_target: report.wineTarget || 0,
      liquor_target: report.liquorTarget || 0,
      wine_sales_ly: report.wineSalesLY || 0,
      liquor_sales_ly: report.liquorSalesLY || 0,
      notes: report.notes || ''
    };
    const res = await fetch(
      `${url}/rest/v1/cost_reports`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) throw new Error('Failed to save cost report');
    const data = await res.json();
    return data?.[0] || null;
  }

  // Borrar un reporte por id
  async function deleteReport(id) {
    const { url, key } = getConfig();
    const res = await fetch(
      `${url}/rest/v1/cost_reports?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      }
    );
    if (!res.ok) throw new Error('Failed to delete cost report');
    return true;
  }

  window.BarStockCostReportCloud = {
    listReports,
    saveReport,
    deleteReport
  };
})();
