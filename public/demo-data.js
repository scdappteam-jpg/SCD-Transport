(function () {
  const customers = [
    { id: "c_wd", name: "WD Export Co., Ltd.", taxId: "0105559000001", billingEmail: "billing@wd-demo.com", creditTerm: 30 },
    { id: "c_hua_thai", name: "Hua Thai Manufacturing", taxId: "0105559000002", billingEmail: "finance@huathai-demo.com", creditTerm: 15 },
    { id: "c_benchmark", name: "Benchmark Electronics", taxId: "0105559000003", billingEmail: "ap@benchmark-demo.com", creditTerm: 30 },
    { id: "c_michelin", name: "Michelin Siam Co., Ltd.", taxId: "0105559000004", billingEmail: "billing@michelin-demo.com", creditTerm: 30 },
    { id: "c_fabrinet", name: "Fabrinet Co., Ltd.", taxId: "0105559000005", billingEmail: "account@fabrinet-demo.com", creditTerm: 15 }
  ];

  const addHours = hours => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const thDate = value => new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const rawJobs = [
    ["JOB-DEMO-001", "4840779189", "c_wd", "TG640", 2, "PickupStarted", "Lithium", "WH3", "12", "320.5", "70-1234", ""],
    ["JOB-DEMO-002", "4840779188", "c_wd", "TG640", 2, "Pending", "Lithium", "TGINT", "4", "88.0", "70-1234", ""],
    ["JOB-DEMO-003", "4840779011", "c_hua_thai", "CX750", 6, "Inbound", "General", "WH3", "7", "797.0", "71-4567", addHours(-1)],
    ["JOB-DEMO-004", "4840778891", "c_michelin", "JL034", 9, "XRayPassed", "General", "BFS", "53", "618.0", "72-8899", addHours(-2)],
    ["JOB-DEMO-005", "4840778893", "c_michelin", "JL034", 9, "XRayPassed", "General", "BFS", "7", "66.5", "72-8899", addHours(-2)],
    ["JOB-DEMO-006", "4840778761", "c_benchmark", "EK373", 14, "Pending", "General", "WH3", "1", "136.0", "73-9012", ""],
    ["JOB-DEMO-007", "4840778251", "c_fabrinet", "SQ713", 22, "ReadyForBilling", "General", "TG", "1", "262.5", "74-0001", addHours(-5)],
    ["JOB-DEMO-008", "4840778123", "c_hua_thai", "BR068", -1, "PickupStarted", "General", "WH3", "2", "500.0", "75-1414", ""],
    ["JOB-DEMO-009", "4840777972", "c_fabrinet", "TG642", 28, "Billed", "General", "TGINT", "2", "400.0", "76-7788", addHours(-10)],
    ["JOB-DEMO-010", "4840777663", "c_benchmark", "QR837", 36, "Pending", "Lithium", "WH3", "1", "10.5", "77-9933", ""]
  ];

  const jobs = rawJobs.map(([id, houseNumber, customerId, flightNo, hours, status, productType, destination, pieceCount, weight, vehiclePlate, cargoIssuedAt], index) => {
    const customer = customers.find(item => item.id === customerId) || customers[0];
    const flightTime = addHours(hours);
    const xrayStatus = ["XRayPassed", "ReadyForBilling", "Billed"].includes(status) ? "Passed" : "Pending";
    return {
      id,
      houseNumber,
      customerId,
      customerName: customer.name,
      flightNo,
      flightTime,
      flightTimeLabel: thDate(flightTime),
      hoursToFlight: hours,
      redFlag: hours < 4 && !["ReadyForBilling", "Billed"].includes(status),
      status,
      driverId: index % 3 === 1 ? "u_driver_02" : (index % 3 === 2 ? "u_driver_03" : "u_driver_01"),
      routeType: destination,
      destination,
      destAirport: destination === "WH3" ? "WH3" : destination,
      productType,
      requiresLithiumDocs: productType === "Lithium",
      xrayStatus,
      loadingDetailUploaded: ["ReadyForBilling", "Billed"].includes(status),
      readyForBilling: ["ReadyForBilling", "Billed"].includes(status),
      canUploadLoadingDetail: xrayStatus === "Passed",
      amount: 6500 + index * 1250,
      pickupCase: index % 3 === 0 ? "SpecialMD" : "GeneralManual",
      cargoFormMode: cargoIssuedAt ? "AdminPrepared" : "DriverWrites",
      adminPrepared: Boolean(cargoIssuedAt),
      cargoIssuedAt,
      pickupDate: new Date().toISOString().slice(0, 10),
      pickupLocation: `${customer.name} Warehouse`,
      driverName: "Driver A",
      vehiclePlate,
      pieceCount,
      pickupItems: [{ houseNumber, destination, carton: pieceCount }],
      packageType: "Carton",
      stickerColor: productType === "Lithium" ? "Yellow" : "",
      weight,
      readyTime: addHours(Math.max(hours - 5, -2)),
      closeTime: addHours(Math.max(hours - 1, 1)),
      updatedAt: new Date().toISOString(),
      createdAt: addHours(-24)
    };
  });

  window.SMART_LOGISTICS_DEMO = {
    users: [
      { id: "u_driver_01", role: "Driver",    name: "คนขับ A",          vehiclePlate: "70-1234", status: "Active" },
      { id: "u_driver_02", role: "Driver",    name: "Driver B / คนขับ B", vehiclePlate: "71-2234", status: "Active" },
      { id: "u_driver_03", role: "Driver",    name: "Driver C / คนขับ C", vehiclePlate: "72-3345", status: "Active" },
      { id: "u_wh_01",     role: "WH_Staff",  name: "พนักงาน WH3",       status: "Active" },
      { id: "u_terminal_01", role: "Terminal", name: "Terminal Lead",    status: "Active" },
      { id: "u_billing_01",  role: "Billing",  name: "บัญชี",            status: "Active" },
      { id: "u_exec_01",   role: "Executive", name: "ผู้บริหาร",          status: "Active" },
      { id: "u_admin_01",  role: "Admin",     name: "แอดมิน",             status: "Active" }
    ],
    customers,
    dashboard: {
      jobs,
      locations: [
        { id: "A-01", status: "Occupied", currentHouseId: "4840779011" },
        { id: "A-02", status: "Available", currentHouseId: "" },
        { id: "B-01", status: "Occupied", currentHouseId: "4840779189" },
        { id: "C-01", status: "Available", currentHouseId: "" }
      ],
      billing: [
        { id: "INV-DEMO-001", customerName: "Fabrinet Co., Ltd.", amount: 15250, status: "Draft", pdfUrl: "" }
      ],
      attachments: [],
      importChanges: [
        {
          id: "CHG-DEMO-001",
          houseNumber: "4840779188",
          customerName: "WD Export Co., Ltd.",
          changes: ["NEW_JOB"],
          notIssued: true,
          message: "งานใหม่ 4840779188 · ยังไม่ออกใบงาน",
          createdAt: new Date().toISOString()
        }
      ],
      alerts: [
        { id: "ALERT-DEMO-001", message: "Demo mode: loaded 10 sample jobs", severity: "info", createdAt: new Date().toISOString() }
      ],
      metrics: {
        openJobs: jobs.filter(job => job.status !== "Billed").length,
        readyForBilling: jobs.filter(job => job.readyForBilling).length,
        billedAmount: jobs.filter(job => job.status === "Billed").reduce((sum, job) => sum + job.amount, 0),
        pendingAmount: jobs.filter(job => job.readyForBilling).reduce((sum, job) => sum + job.amount, 0),
        averageDurationMinutes: 95
      }
    }
  };
})();
