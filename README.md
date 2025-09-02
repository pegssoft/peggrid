# peggrid
A lightweight, vanilla JavaScript DataGrid with search, sort, pagination, row selection, csv export and skeleton loading.

## :) Demo Link 
https://pegssoft.github.io/peggrid/

## 🚀 Features
- Search (global)
- Sorting
- Pagination
- Row selection (single & multi)
- Skeleton loading
- Sticky headers & horizontal scrolling

## 📦 Usage
```html
<link rel="stylesheet" href="peggrid.css">
<div id="grid"></div>
<script src="peggrid.js?v=1.0"></script>
<script>
    const data = Array.from({ length: 45 }, (_, i) => ({
        _key: i + 1,
        dateReg: "2025-08-25",
        lastTrans: "2025-08-25",
        customerId: i + 1,
        tier: (i % 3) - 1,
        active: i % 2 === 0,
        amount: (i * 1000).toLocaleString(),
        status: ["ok", "fail", "pending"][i % 3],
        customerName: "Customer " + (i + 1)
    }));

    const grid = new PegGrid("#grid", {
        data,
        search: true,
        pagination: { pageSize: 10, pageSizes: [5, 10, 25, 50] },
        columns: [
            { field: "_key", label: "Key", width: 120, checkboxSelection: true, sortable: true, filter: true },
            { field: "dateReg", label: "Date Reg", width: 140, sortable: true },
            { field: "lastTrans", label: "Last Trans", width: 140, sortable: true },
            { field: "customerId", label: "Customer Id", width: 140, sortable: true, filter: true },
            { field: "tier", label: "Tier", width: 100, sortable: true },
            { field: "active", label: "Active", width: 110 }, // boolean renders as checkbox
            {
                field: "amount", label: "Amount", valueFormatter: (params) => "₦" + params.value.toLocaleString(),
                 width: 140 },
            {
                field: "status", label: "Status", width: 120, filter: true,
                icon: (val) => val === "ok" ? "✅ OK" : val === "fail" ? "❌ FAIL" : "⏳ Pending"
                // or use `render: (val,row)=> ...` to fully control HTML
            },
            { field: "customerName", label: "Customer Name", width: 200, sortable: true, filter: true },
        ]
    });

    // Optional callbacks
    //grid.onRowClick = (row) => console.log("Row click:", row);
    grid.onRowDoubleClick = (row) => console.log("Row dbl:", row);
    grid.onSelectionChange = (rows) => console.log("Selected rows:", rows);
    //grid.exportToExcel("mydata.csv");

    // Example refresh:
    // grid.refresh([...newData]);
</script>

