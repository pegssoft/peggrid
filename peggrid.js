class PegGrid {
    constructor(selector, options) {
        // options
        this.container = document.querySelector(selector);
        this.data = Array.isArray(options.data) ? options.data : [];
        this.columns = Array.isArray(options.columns) ? options.columns : [];
        this.searchable = !!options.search;
        this.pageSize = options.pagination?.pageSize ?? 10;
        this.pageSizes = options.pagination?.pageSizes ?? [10, 25, 50, 100];

        // state
        this.filtered = [...this.data];
        this.currentPage = 1;
        this.sortState = { field: null, dir: null }; // dir: "asc" | "desc" | null
        this.selectedKeys = new Set();
        this.searchQuery = "";

        // selection key field (from the first checkboxSelection column, if any)
        const selCol = this.columns.find(c => c.checkboxSelection);
        this.selectionKeyField = selCol?.field ?? null;

        // render
        this._renderShell();
        this._renderHeader();
        this._showSkeleton();
        setTimeout(() => {
            this._renderBody();
            this._renderFooter();
        }, 500);
    }

    /* ---------- Public API ---------- */
    refresh(newData) {
        if (Array.isArray(newData)) {
            this.data = [...newData];
        }
        // reset derived state
        this.filtered = this._applySearch(this.searchQuery, this.data);
        this._applySortInPlace();
        this.currentPage = 1;
        this.selectedKeys.clear();
        this._showSkeleton();
        setTimeout(() => {
            this._renderBody();
            this._renderFooter();
        }, 400);
    }
    getSelectedKeys() {
        return [...this.selectedKeys];
    }
    getSelectedRows() {
        if (!this.selectionKeyField) return [];
        const keySet = new Set(this.selectedKeys);
        return this.data.filter(r => keySet.has(r[this.selectionKeyField]));
    }

    /* ---------- Shell ---------- */
    _renderShell() {
        this.container.innerHTML = `
      <div class="peggrid-header">
        <div class="peggrid-left">
          ${this.searchable ? `<input aria-label="Search" type="text" class="peggrid-search" placeholder="Search..."/>` : ""}
           <button class="peggrid-refresh" type="button">⟳</button>
           <button class="peggrid-export">⬇ Export CSV</button>
        </div>
      </div>

      <div class="peggrid-wrapper">
        <table class="peggrid-table">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="peggrid-footer">
        <div class="peggrid-range"></div>
        <div class="peggrid-page-controls">
          <label>
            Page size
            <select class="peggrid-page-size"></select>
          </label>
          <button class="peggrid-btn peggrid-first"  type="button">« First</button>
          <button class="peggrid-btn peggrid-prev"   type="button">‹ Prev</button>
          <span class="peggrid-page-info"></span>
          <button class="peggrid-btn peggrid-next"   type="button">Next ›</button>
          <button class="peggrid-btn peggrid-last"   type="button">Last »</button>
        </div>
      </div>
    `;

        // search
        if (this.searchable) {
            const inp = this.container.querySelector(".peggrid-search");
            inp.addEventListener("input", (e) => {
                this.searchQuery = e.target.value;
                this.filtered = this._applySearch(this.searchQuery, this.data);
                this.currentPage = 1;
                // keep any sort applied
                this._applySortInPlace();
                this.selectedKeys.clear(); // clear selection after a new filter
                this._renderBody();
                this._renderFooter();
            });
        }

        // refresh
        this.container.querySelector(".peggrid-refresh")
            .addEventListener("click", () => this.refresh());
        // Export
        this.container.querySelector(".peggrid-export")
            .addEventListener("click", () => this.exportToExcel());


        // page size select
        const sizeSel = this.container.querySelector(".peggrid-page-size");
        this.pageSizes.forEach(sz => {
            const opt = document.createElement("option");
            opt.value = String(sz);
            opt.textContent = String(sz);
            if (sz === this.pageSize) opt.selected = true;
            sizeSel.appendChild(opt);
        });
        sizeSel.addEventListener("change", e => {
            this.pageSize = Number(e.target.value);
            this.currentPage = 1;
            this._renderBody();
            this._renderFooter();
        });

        // pagination buttons
        this.container.querySelector(".peggrid-first").addEventListener("click", () => this._gotoPage(1));
        this.container.querySelector(".peggrid-prev").addEventListener("click", () => this._gotoPage(this.currentPage - 1));
        this.container.querySelector(".peggrid-next").addEventListener("click", () => this._gotoPage(this.currentPage + 1));
        this.container.querySelector(".peggrid-last").addEventListener("click", () => this._gotoPage(this._totalPages()));
    }

    _gotoPage(p) {
        const total = this._totalPages();
        const clamped = Math.max(1, Math.min(total, p || 1));
        if (clamped === this.currentPage) return;
        this.currentPage = clamped;
        this._renderBody();
        this._renderFooter();
    }

    /* ---------- Header ---------- */
    _renderHeader() {
        const thead = this.container.querySelector("thead");
        thead.innerHTML = "";
        const tr = document.createElement("tr");

        this.columns.forEach(col => {
            const th = document.createElement("th");

            // fixed width if provided
            if (col.width) th.style.width = `${col.width}px`;

            // label + sort indicator
            const lbl = document.createElement("span");
            lbl.textContent = col.label ?? col.field ?? "";
            th.appendChild(lbl);

            // checkboxSelection header (Select All on current page)
            if (col.checkboxSelection) {
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.setAttribute("aria-label", "Select all rows on this page");
                cb.addEventListener("change", () => {
                    const page = this._currentPageSlice();
                    page.forEach(r => {
                        const key = this.selectionKeyField ? r[this.selectionKeyField] : null;
                        if (key == null) return;
                        if (cb.checked) this.selectedKeys.add(key);
                        else this.selectedKeys.delete(key);
                    });
                    this._renderBody(); // refresh check states
                });
                th.prepend(cb);
            }

            // sorting
            if (col.sortable) {
                th.classList.add("peggrid-sortable");
                const ind = document.createElement("span");
                ind.className = "peggrid-sort-ind";
                th.appendChild(ind);

                const applyArrow = () => {
                    ind.textContent = "";
                    if (this.sortState.field === col.field) {
                        ind.textContent = this.sortState.dir === "asc" ? "▲" :
                            this.sortState.dir === "desc" ? "▼" : "";
                    }
                };
                applyArrow();

                th.addEventListener("click", () => {
                    // toggle asc -> desc -> none
                    if (this.sortState.field !== col.field) {
                        this.sortState = { field: col.field, dir: "asc" };
                    } else if (this.sortState.dir === "asc") {
                        this.sortState.dir = "desc";
                    } else if (this.sortState.dir === "desc") {
                        this.sortState = { field: null, dir: null };
                    } else {
                        this.sortState.dir = "asc";
                    }
                    this._applySortInPlace();
                    // update arrows on all sortable headers
                    this._renderHeader();
                    this._renderBody();
                });
            }

            tr.appendChild(th);
        });

        thead.appendChild(tr);
    }

    /* ---------- Body ---------- */
    _showSkeleton() {
        const tbody = this.container.querySelector("tbody");
        tbody.innerHTML = "";
        for (let i = 0; i < this.pageSize; i++) {
            const tr = document.createElement("tr");
            this.columns.forEach(() => {
                const td = document.createElement("td");
                td.innerHTML = `<div class="peggrid-skel"></div>`;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
    }

    _renderBody() {
        const tbody = this.container.querySelector("tbody");
        tbody.innerHTML = "";

        const page = this._currentPageSlice();
        if (page.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = this.columns.length;
            td.textContent = "No data";
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        page.forEach(row => {
            const tr = document.createElement("tr");

            // row events: expose via options if provided
            tr.addEventListener("click", () => {
                if (typeof this.onRowClick === "function") this.onRowClick(row);
                if (typeof this.container.__pegOnRowClick === "function") this.container.__pegOnRowClick(row);
            });
            tr.addEventListener("dblclick", () => {
                if (typeof this.onRowDoubleClick === "function") this.onRowDoubleClick(row);
                if (typeof this.container.__pegOnRowDoubleClick === "function") this.container.__pegOnRowDoubleClick(row);
            });

            this.columns.forEach(col => {
                const td = document.createElement("td");
                if (col.width) td.style.width = `${col.width}px`;

                // 1) checkbox selection column
                if (col.checkboxSelection) {
                    const key = this.selectionKeyField ? row[this.selectionKeyField] : null;
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = key != null && this.selectedKeys.has(key);
                    cb.addEventListener("change", () => {
                        if (key == null) return;
                        if (cb.checked) this.selectedKeys.add(key);
                        else this.selectedKeys.delete(key);
                        // optional callback
                        if (typeof this.onSelectionChange === "function") {
                            this.onSelectionChange(this.getSelectedRows());
                        }
                    });
                    td.appendChild(cb);
                    tr.appendChild(td);
                    return;
                }

                // 2) explicit custom renderer takes precedence
                if (typeof col.render === "function") {
                    td.innerHTML = col.render(row[col.field], row);
                    tr.appendChild(td);
                    return;
                }

                // 3) valueFormatter
                if (typeof col.valueFormatter === "function") {
                    td.textContent = col.valueFormatter({ value: row[col.field], rowData: row });
                    tr.appendChild(td);
                    return;
                }

                // 3) icon helper
                if (typeof col.icon === "function") {
                    td.innerHTML = col.icon(row[col.field], row);
                    tr.appendChild(td);
                    return;
                }

                // 4) boolean -> checkbox (read-only)
                const value = row[col.field];
                if (typeof value === "boolean") {
                    const b = document.createElement("input");
                    b.type = "checkbox";
                    b.disabled = true;
                    b.checked = value;
                    td.appendChild(b);
                    tr.appendChild(td);
                    return;
                }

                // 5) default text
                td.textContent = value ?? "";
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }

    /* ---------- Footer / Pagination ---------- */
    _renderFooter() {
        const total = this.filtered.length;
        const totalPages = this._totalPages();
        const startIdx = total === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
        const endIdx = Math.min(this.currentPage * this.pageSize, total);

        this.container.querySelector(".peggrid-range").textContent =
            `${startIdx} to ${endIdx} of ${total}`;

        this.container.querySelector(".peggrid-page-info").textContent =
            `Page ${this.currentPage} of ${totalPages || 1}`;

        // enable/disable nav buttons
        this.container.querySelector(".peggrid-first").disabled = this.currentPage <= 1;
        this.container.querySelector(".peggrid-prev").disabled = this.currentPage <= 1;
        this.container.querySelector(".peggrid-next").disabled = this.currentPage >= totalPages;
        this.container.querySelector(".peggrid-last").disabled = this.currentPage >= totalPages;
    }

    _totalPages() {
        return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    }
    _currentPageSlice() {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.filtered.slice(start, start + this.pageSize);
    }

    /* ---------- Search & Sort ---------- */
    _applySearch(query, rows) {
        const q = String(query || "").trim().toLowerCase();
        if (!q) return [...rows];

        // If any columns have filter:true, search ONLY those; otherwise search all configured columns.
        const filterCols = this.columns.filter(c => c.filter).map(c => c.field);
        const fieldsToSearch = filterCols.length ? filterCols : this.columns.map(c => c.field);

        return rows.filter(r =>
            fieldsToSearch.some(f => {
                const v = r?.[f];
                return v != null && String(v).toLowerCase().includes(q);
            })
        );
    }

    _applySortInPlace() {
        const { field, dir } = this.sortState;
        if (!field || !dir) return; // no sort
        const cmp = (a, b) => {
            const va = a?.[field];
            const vb = b?.[field];
            if (va == null && vb == null) return 0;
            if (va == null) return -1;
            if (vb == null) return 1;
            if (typeof va === "number" && typeof vb === "number") return va - vb;
            if (typeof va === "boolean" && typeof vb === "boolean") return (va === vb) ? 0 : (va ? 1 : -1);
            return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
        };
        this.filtered.sort((a, b) => dir === "asc" ? cmp(a, b) : -cmp(a, b));
    }

    exportToExcel(filename = "pegGrid.csv") {
        let rows = [];

        // headers
        rows.push(this.columns.map(c => c.label || c.field).join(","));

        // data
        this.filtered.forEach(row => {
            let rowValues = this.columns.map(col => {
                let val = row[col.field];
                if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
                return `"${val ?? ""}"`;
            });
            rows.push(rowValues.join(","));
        });

        const csvContent = rows.join("\n");
        const blob = new Blob([csvContent], { type: "application/vnd.ms-excel" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    /* ---------- Optional callbacks (assign after init if you like) ---------- */
    onRowClick = null;
    onRowDoubleClick = null;
    onSelectionChange = null;
}
