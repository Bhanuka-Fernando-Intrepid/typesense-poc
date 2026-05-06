import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { client } from './typesense/client'
import './InsightsDashboard.css'

function getDefaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)

  const toInputValue = (date) => date.toISOString().slice(0, 10)

  return {
    startDate: toInputValue(start),
    endDate: toInputValue(end),
  }
}

function parseDateToUnix(value, isEnd) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0))
  const unix = Math.floor(date.getTime() / 1000)
  return Number.isFinite(unix) ? unix : null
}

function formatNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0'
  return numeric.toLocaleString()
}

function formatPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0%'
  return `${numeric.toFixed(1)}%`
}

function formatDateTime(unixSeconds) {
  const numeric = Number(unixSeconds)
  if (!Number.isFinite(numeric)) return 'N/A'
  return new Date(numeric * 1000).toLocaleString()
}

function formatCurrency(value, currencyCode) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) return '-'

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode || 'USD',
    maximumFractionDigits: 0,
  }).format(numeric)
}

function getEventPillClass(type) {
  return type === 'conversion'
    ? 'event-pill event-pill-conversion'
    : 'event-pill event-pill-click'
}

function getFacetCountsMap(facetCounts, fieldName) {
  const field = facetCounts.find((facet) => facet.field_name === fieldName)

  if (!field || !Array.isArray(field.counts)) return new Map()

  return new Map(field.counts.map((entry) => [String(entry.value), entry.count]))
}

function groupEventsByProduct(events, eventType) {
  const map = new Map()

  events.forEach((event) => {
    if (event.eventType !== eventType) return

    const code = String(event.productCode || 'unknown')

    const current = map.get(code) || {
      productCode: code,
      tripName: event.tripName || 'Unknown trip',
      count: 0,
    }

    current.count += 1
    map.set(code, current)
  })

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

async function fetchPopularQueries() {
  const result = await client.collections('departure_popular_queries').documents().search({
    q: '*',
    query_by: 'q',
    sort_by: 'count:desc',
    per_page: 10,
  })

  return Array.isArray(result.hits) ? result.hits.map((hit) => hit.document) : []
}

async function fetchNoHitQueries() {
  const result = await client.collections('departure_nohit_queries').documents().search({
    q: '*',
    query_by: 'q',
    sort_by: 'count:desc',
    per_page: 10,
  })

  return Array.isArray(result.hits) ? result.hits.map((hit) => hit.document) : []
}

async function fetchEventStats(startDate, endDate) {
  const start = parseDateToUnix(startDate, false)
  const end = parseDateToUnix(endDate, true)
  const filterParts = []

  if (start !== null && end !== null) {
    filterParts.push(`timestamp:>=${start} && timestamp:<=${end}`)
  }

  const result = await client.collections('departure_events').documents().search({
    q: '*',
    query_by: 'tripName,productCode,query',
    filter_by: filterParts.join(' && '),
    facet_by: 'eventType,productCode,userId,query',
    max_facet_values: 20,
    per_page: 50,
    sort_by: 'timestamp:desc',
  })

  return {
    hits: Array.isArray(result.hits) ? result.hits.map((hit) => hit.document) : [],
    facetCounts: result.facet_counts || [],
  }
}

async function fetchTripPrices(productCodes, collectionName) {
  const requests = productCodes.map((code) =>
    client.collections(collectionName).documents().search({
      q: '*',
      query_by: 'name',
      filter_by: `productCode:=\`${code}\``,
      per_page: 1,
    }),
  )

  const responses = await Promise.all(requests)
  const priceMap = new Map()

  responses.forEach((response, index) => {
    const doc = Array.isArray(response.hits) && response.hits[0] ? response.hits[0].document : null

    if (doc) {
      priceMap.set(productCodes[index], doc.lowestPrice || null)
    }
  })

  return priceMap
}

function calculateMetrics(popularQueries, noHitQueries, eventStats) {
  const totalPopular = popularQueries.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const totalNoHit = noHitQueries.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const totalSearches = totalPopular + totalNoHit

  const eventTypeCounts = getFacetCountsMap(eventStats.facetCounts, 'eventType')
  const totalClicks = Number(eventTypeCounts.get('click') || 0)
  const totalConversions = Number(eventTypeCounts.get('conversion') || 0)

  const userCounts = getFacetCountsMap(eventStats.facetCounts, 'userId')
  const uniqueUsers = userCounts.size

  const noResultRate = totalSearches ? (totalNoHit / totalSearches) * 100 : 0
  const clickThroughRate = totalSearches ? (totalClicks / totalSearches) * 100 : 0
  const conversionRate = totalClicks ? (totalConversions / totalClicks) * 100 : 0

  return {
    totalSearches,
    totalNoHit,
    noResultRate,
    totalClicks,
    totalConversions,
    clickThroughRate,
    conversionRate,
    uniqueUsers,
  }
}

function exportToCsv(filename, headers, rows) {
  const escapeCell = (value) => {
    const str = String(value ?? '')

    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }

    return str
  }

  const lines = [headers.join(',')]

  rows.forEach((row) => {
    lines.push(row.map(escapeCell).join(','))
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.setAttribute('download', filename)

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

function getCurrencyPrice(lowestPrice, currency) {
  if (!lowestPrice || typeof lowestPrice !== 'object') return null

  const priceData = lowestPrice[currency] || lowestPrice.usd || Object.values(lowestPrice)[0]

  if (!priceData) return null

  return Number(priceData.price)
}

function PanelTitle({ title, subtitle }) {
  return (
    <div className="insights-panel-title">
      <h3>{title}</h3>
      <span className="panel-subtext">{subtitle}</span>
    </div>
  )
}

function EmptyRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan} className="query-muted">
        {message}
      </td>
    </tr>
  )
}

export default function InsightsDashboard({
  selectedRegion,
  selectedCurrency,
  regionOptions,
  onRegionChange,
  collectionName,
}) {
  const defaultRange = useMemo(() => getDefaultRange(), [])
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [popularQueries, setPopularQueries] = useState([])
  const [noHitQueries, setNoHitQueries] = useState([])
  const [eventStats, setEventStats] = useState({ hits: [], facetCounts: [] })
  const [metrics, setMetrics] = useState({
    totalSearches: 0,
    totalNoHit: 0,
    noResultRate: 0,
    totalClicks: 0,
    totalConversions: 0,
    clickThroughRate: 0,
    conversionRate: 0,
    uniqueUsers: 0,
  })
  const [priceMap, setPriceMap] = useState(new Map())

  const refresh = async () => {
    setLoading(true)
    setError('')

    try {
      const [popular, noHit, events] = await Promise.all([
        fetchPopularQueries(),
        fetchNoHitQueries(),
        fetchEventStats(startDate, endDate),
      ])

      setPopularQueries(popular)
      setNoHitQueries(noHit)
      setEventStats(events)
      setMetrics(calculateMetrics(popular, noHit, events))
    } catch (err) {
      console.error('Insights fetch error:', err)
      setError('Unable to load insights right now.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [startDate, endDate])

  const mostClicked = useMemo(
    () => groupEventsByProduct(eventStats.hits, 'click'),
    [eventStats.hits],
  )

  const mostConverted = useMemo(
    () => groupEventsByProduct(eventStats.hits, 'conversion'),
    [eventStats.hits],
  )

  const recentEvents = useMemo(() => eventStats.hits.slice(0, 20), [eventStats.hits])

  useEffect(() => {
    const codes = mostConverted.map((item) => item.productCode)

    if (codes.length === 0) {
      setPriceMap(new Map())
      return
    }

    fetchTripPrices(codes, collectionName)
      .then((map) => setPriceMap(map))
      .catch((err) => console.error('Failed to fetch trip prices:', err))
  }, [mostConverted, collectionName])

  const totalEstimatedRevenue = mostConverted.reduce((sum, item) => {
    const price = getCurrencyPrice(priceMap.get(item.productCode), selectedCurrency)

    if (!price) return sum

    return sum + price * item.count
  }, 0)

  const metricCards = [
    {
      label: 'Total searches',
      value: formatNumber(metrics.totalSearches),
    },
    {
      label: 'No-result searches',
      value: formatNumber(metrics.totalNoHit),
    },
    {
      label: 'No result rate',
      value: formatPercent(metrics.noResultRate),
    },
    {
      label: 'Total clicks',
      value: formatNumber(metrics.totalClicks),
    },
    {
      label: 'Total conversions',
      value: formatNumber(metrics.totalConversions),
    },
    {
      label: 'Click-through rate',
      value: formatPercent(metrics.clickThroughRate),
    },
    {
      label: 'Conversion rate',
      value: formatPercent(metrics.conversionRate),
    },
    {
      label: 'Unique users',
      value: formatNumber(metrics.uniqueUsers),
    },
    {
      label: 'Est. revenue',
      value: formatCurrency(totalEstimatedRevenue, selectedCurrency.toUpperCase()),
    },
  ]

  return (
    <div className="insights-page">
      <div className="insights-header">
        <div>
          <span className="insights-kicker">Analytics</span>
          <h1>Insights dashboard</h1>
          <p>
            Track search performance, no-result queries, user clicks, conversions,
            and estimated trip revenue from your Typesense analytics data.
          </p>
        </div>

        <Link className="insights-back" to="/">
          Back to Search
        </Link>
      </div>

      <div className="insights-controls">
        <div className="insights-control">
          <label>Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div className="insights-control">
          <label>End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <div className="insights-control">
          <label>Currency</label>
          <select value={selectedRegion} onChange={(event) => onRegionChange(event.target.value)}>
            {regionOptions.map((region) => (
              <option key={region.label} value={region.label}>
                {region.label}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="insights-refresh" onClick={refresh}>
          Refresh insights
        </button>
      </div>

      {loading ? <div className="state">Loading insights...</div> : null}
      {error ? <div className="state state-error">{error}</div> : null}

      {!loading && !error ? (
        <>
          <div className="insights-metrics">
            {metricCards.map((card) => (
              <div key={card.label} className="insight-card">
                <div className="insight-card-label">{card.label}</div>
                <div className="insight-card-value">{card.value}</div>

                <svg className="insight-card-spark" viewBox="0 0 120 20" aria-hidden="true">
                  <path
                    d="M0 12 L20 10 L40 14 L60 8 L80 13 L100 6 L120 10"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            ))}
          </div>

          <div className="insights-grid">
            <div className="insights-panel">
              <div className="insights-panel-header">
                <PanelTitle
                  title="Popular searches"
                  subtitle="Top queries people searched for"
                />

                <button
                  type="button"
                  className="insights-export"
                  onClick={() =>
                    exportToCsv(
                      'popular_searches.csv',
                      ['Query', 'Count'],
                      popularQueries.map((item) => [item.q, item.count]),
                    )
                  }
                >
                  Export CSV
                </button>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Count</th>
                  </tr>
                </thead>

                <tbody>
                  {popularQueries.length > 0 ? (
                    popularQueries.map((item) => (
                      <tr key={item.q}>
                        <td>
                          <span className="query-chip">{item.q}</span>
                        </td>
                        <td>{formatNumber(item.count)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={2} message="No popular search data found." />
                  )}
                </tbody>
              </table>
            </div>

            <div className="insights-panel">
              <div className="insights-panel-header">
                <PanelTitle
                  title="No-result searches"
                  subtitle="Queries with no matching results"
                />

                <button
                  type="button"
                  className="insights-export"
                  onClick={() =>
                    exportToCsv(
                      'no_result_searches.csv',
                      ['Query', 'Count'],
                      noHitQueries.map((item) => [item.q, item.count]),
                    )
                  }
                >
                  Export CSV
                </button>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Count</th>
                  </tr>
                </thead>

                <tbody>
                  {noHitQueries.length > 0 ? (
                    noHitQueries.map((item) => (
                      <tr key={item.q}>
                        <td>
                          <span className="query-chip">{item.q}</span>
                        </td>
                        <td>{formatNumber(item.count)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={2} message="No no-result search data found." />
                  )}
                </tbody>
              </table>
            </div>

            <div className="insights-panel">
              <div className="insights-panel-header">
                <PanelTitle
                  title="Most clicked trips"
                  subtitle="Trips getting the most clicks"
                />

                <button
                  type="button"
                  className="insights-export"
                  onClick={() =>
                    exportToCsv(
                      'most_clicked_trips.csv',
                      ['Trip', 'Code', 'Clicks'],
                      mostClicked.map((item) => [item.tripName, item.productCode, item.count]),
                    )
                  }
                >
                  Export CSV
                </button>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Code</th>
                    <th>Clicks</th>
                  </tr>
                </thead>

                <tbody>
                  {mostClicked.length > 0 ? (
                    mostClicked.map((item) => (
                      <tr key={item.productCode}>
                        <td className="trip-cell">{item.tripName}</td>
                        <td>
                          <span className="code-badge">{item.productCode}</span>
                        </td>
                        <td>{formatNumber(item.count)}</td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow colSpan={3} message="No click data found." />
                  )}
                </tbody>
              </table>
            </div>

            <div className="insights-panel">
              <div className="insights-panel-header">
                <PanelTitle
                  title="Most converted trips"
                  subtitle="Trips generating the most conversions"
                />

                <button
                  type="button"
                  className="insights-export"
                  onClick={() =>
                    exportToCsv(
                      'most_converted_trips.csv',
                      ['Trip', 'Code', 'Conversions', 'Price', 'Revenue'],
                      mostConverted.map((item) => {
                        const price = getCurrencyPrice(
                          priceMap.get(item.productCode),
                          selectedCurrency,
                        )
                        const revenue = price ? price * item.count : 0

                        return [
                          item.tripName,
                          item.productCode,
                          item.count,
                          price ? formatCurrency(price, selectedCurrency.toUpperCase()) : '-',
                          revenue ? formatCurrency(revenue, selectedCurrency.toUpperCase()) : '-',
                        ]
                      }),
                    )
                  }
                >
                  Export CSV
                </button>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Code</th>
                    <th>Conversions</th>
                    <th>Price</th>
                    <th>Revenue</th>
                  </tr>
                </thead>

                <tbody>
                  {mostConverted.length > 0 ? (
                    mostConverted.map((item) => {
                      const price = getCurrencyPrice(priceMap.get(item.productCode), selectedCurrency)
                      const revenue = price ? price * item.count : null

                      return (
                        <tr key={item.productCode}>
                          <td className="trip-cell">{item.tripName}</td>
                          <td>
                            <span className="code-badge">{item.productCode}</span>
                          </td>
                          <td>{formatNumber(item.count)}</td>
                          <td>
                            {price ? formatCurrency(price, selectedCurrency.toUpperCase()) : '-'}
                          </td>
                          <td>
                            {revenue ? formatCurrency(revenue, selectedCurrency.toUpperCase()) : '-'}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <EmptyRow colSpan={5} message="No conversion data found." />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="insights-panel insights-recent">
            <div className="insights-panel-header insights-recent-header">
              <PanelTitle
                title="Recent events"
                subtitle="Last 20 tracked user actions"
              />

              <button
                type="button"
                className="insights-export"
                onClick={() =>
                  exportToCsv(
                    'recent_events.csv',
                    ['Type', 'Trip', 'Code', 'Query', 'User', 'Time'],
                    recentEvents.map((event) => [
                      event.eventType,
                      event.tripName || 'Unknown trip',
                      event.productCode || 'N/A',
                      event.query || '-',
                      event.userId || '-',
                      formatDateTime(event.timestamp),
                    ]),
                  )
                }
              >
                Export CSV
              </button>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Trip</th>
                  <th>Code</th>
                  <th>Query</th>
                  <th>User</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>
                {recentEvents.length > 0 ? (
                  recentEvents.map((event, index) => (
                    <tr key={`${event.docId || event.productCode}_${index}`}>
                      <td>
                        <span className={getEventPillClass(event.eventType)}>
                          {event.eventType}
                        </span>
                      </td>

                      <td className="trip-cell">{event.tripName || 'Unknown trip'}</td>

                      <td>
                        <span className="code-badge">{event.productCode || 'N/A'}</span>
                      </td>

                      <td>
                        {event.query ? (
                          <span className="query-chip">{event.query}</span>
                        ) : (
                          <span className="query-muted">No query</span>
                        )}
                      </td>

                      <td>
                        {event.userId ? (
                          <span className="user-chip">{`${event.userId.slice(0, 6)}...`}</span>
                        ) : (
                          <span className="query-muted">Anonymous</span>
                        )}
                      </td>

                      <td className="time-cell">{formatDateTime(event.timestamp)}</td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow colSpan={6} message="No recent events found." />
                )}
              </tbody>
            </table>
          </div>

    
        </>
      ) : null}
    </div>
  )
}