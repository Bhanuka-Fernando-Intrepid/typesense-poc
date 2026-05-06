import { useState } from "react";
import { csrSearch } from "../typesense/csrSearch";
import { ssrSearch } from "../typesense/ssrSearch";

export default function PerformancePage() {
  const [query, setQuery] = useState("");
  const [csrResult, setCsrResult] = useState(null);
  const [ssrResult, setSsrResult] = useState(null);
  const [csrError, setCsrError] = useState(null);
  const [ssrError, setSsrError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const runTest = async () => {
    setCsrResult(null);
    setSsrResult(null);
    setCsrError(null);
    setSsrError(null);
    setLoading(true);

    const [csrOutcome, ssrOutcome] = await Promise.allSettled([
      csrSearch({ query: query || "*" }),
      ssrSearch({ query: query || "*" }),
    ]);

    setLoading(false);

    let csrData = null;
    let ssrData = null;

    if (csrOutcome.status === "fulfilled") {
      csrData = csrOutcome.value;
      setCsrResult(csrData);
    } else {
      setCsrError(csrOutcome.reason?.message);
    }

    if (ssrOutcome.status === "fulfilled") {
      ssrData = ssrOutcome.value;
      setSsrResult(ssrData);
    } else {
      setSsrError(ssrOutcome.reason?.message);
    }

    if (csrData || ssrData) {
      setHistory((prev) => [
        {
          query: query || "*",
          time: new Date().toLocaleTimeString(),
          csr_total: csrData?.timing?.total_ms,
          ssr_total: ssrData?.timing?.browser_total_ms,
          engine_ms:
            csrData?.timing?.typesense_search_ms ??
            ssrData?.timing?.typesense_search_ms,
          csr_network: csrData?.timing?.network_ms,
          ssr_server_total: ssrData?.timing?.server_total_ms,
          ssr_b2s: ssrData?.timing?.browser_to_server_ms,
        },
        ...prev.slice(0, 9),
      ]);
    }
  };

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "900px",
        margin: "0 auto",
        fontFamily: "monospace",
      }}
    >
      <h2>Typesense — CSR vs SSR Performance Test</h2>
      <hr />

      {/* ── Search input ── */}
      <div style={{ margin: "16px 0" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runTest()}
          placeholder="Enter search query (blank = wildcard *)"
          style={{ width: "400px", padding: "6px", marginRight: "8px" }}
        />
        <button onClick={runTest} disabled={loading}>
          {loading ? "Running..." : "Run Test"}
        </button>
      </div>

      <hr />

      {/* ── Results ── */}
      {(csrResult || ssrResult || csrError || ssrError) && (
        <div style={{ display: "flex", gap: "48px", marginTop: "16px" }}>
          {/* CSR column */}
          <div>
            <h3>CSR (Browser → Typesense)</h3>
            {csrError && <p style={{ color: "red" }}>Error: {csrError}</p>}
            {csrResult && (
              <table>
                <tbody>
                  <tr>
                    <td>Total (browser round-trip)</td>
                    <td>&nbsp;&nbsp;</td>
                    <td>
                      <b>{csrResult.timing.total_ms} ms</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Typesense engine time</td> <td></td>
                    <td>{csrResult.timing.typesense_search_ms} ms</td>
                  </tr>
                  <tr>
                    <td>Network (browser → Typesense)</td>
                    <td></td>
                    <td>{csrResult.timing.network_ms} ms</td>
                  </tr>
                  <tr>
                    <td>Results found</td> <td></td>
                    <td>{csrResult.found}</td>
                  </tr>
                  <tr>
                    <td>Results returned</td> <td></td>
                    <td>{csrResult.hits.length}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* SSR column */}
          <div>
            <h3>SSR (Browser → Server → Typesense)</h3>
            {ssrError && <p style={{ color: "red" }}>Error: {ssrError}</p>}
            {ssrResult && (
              <table>
                <tbody>
                  <tr>
                    <td>Total (browser round-trip)</td> <td>&nbsp;&nbsp;</td>
                    <td>
                      <b>{ssrResult.timing.browser_total_ms} ms</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Typesense engine time</td> <td></td>
                    <td>{ssrResult.timing.typesense_search_ms} ms</td>
                  </tr>
                  <tr>
                    <td>Server total (server → Typesense)</td>
                    <td></td>
                    <td>{ssrResult.timing.server_total_ms} ms</td>
                  </tr>
                  <tr>
                    <td>Server overhead</td> <td></td>
                    <td>{ssrResult.timing.server_overhead_ms} ms</td>
                  </tr>
                  <tr>
                    <td>Browser → server network</td> <td></td>
                    <td>{ssrResult.timing.browser_to_server_ms} ms</td>
                  </tr>
                  <tr>
                    <td>Results found</td> <td></td>
                    <td>{ssrResult.found}</td>
                  </tr>
                  <tr>
                    <td>Results returned</td> <td></td>
                    <td>{ssrResult.hits.length}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── History table ── */}
      {history.length > 0 && (
        <>
          <hr style={{ marginTop: "32px" }} />
          <h3>Run History</h3>
          <table
            border="1"
            cellPadding="6"
            cellSpacing="0"
            style={{ borderCollapse: "collapse", fontSize: "13px" }}
          >
            <thead>
              <tr>
                <th>Time</th>
                <th>Query</th>
                <th>Engine ms</th>
                <th>CSR Total</th>
                <th>CSR Network</th>
                <th>SSR Total</th>
                <th>SSR Server</th>
                <th>SSR B→S</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => {
                const diff =
                  r.csr_total != null && r.ssr_total != null
                    ? r.ssr_total - r.csr_total
                    : null;
                return (
                  <tr key={i}>
                    <td>{r.time}</td>
                    <td>{r.query}</td>
                    <td>{r.engine_ms ?? "—"} ms</td>
                    <td>{r.csr_total ?? "—"} ms</td>
                    <td>{r.csr_network ?? "—"} ms</td>
                    <td>{r.ssr_total ?? "—"} ms</td>
                    <td>{r.ssr_server_total ?? "—"} ms</td>
                    <td>{r.ssr_b2s ?? "—"} ms</td>
                    <td>
                      {diff == null
                        ? "—"
                        : diff > 0
                          ? `SSR +${diff} ms slower`
                          : `SSR ${Math.abs(diff)} ms faster`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
