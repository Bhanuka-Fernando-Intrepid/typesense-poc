import { useEffect, useMemo, useState } from 'react'
import Typesense from 'typesense'
import './App.css'

const client = new Typesense.Client({
  nodes: [
    {
      host: "t13xazwfmsn2bu0kp-1.a2.typesense.net",
      port: 443,
      protocol: "https"
    }
  ],
  apiKey: "X5w9IBpJCxQu3DC2utYt3IUJeAbdak3E", // VERY IMPORTANT
  connectionTimeoutSeconds: 2
});

const CARD_IMAGES = ['image-1', 'image-2', 'image-3', 'image-4']

const REGION_CONFIG = [
  { label: 'Australia', currency: 'aud' },
  { label: 'Belgium', currency: 'eur' },
  { label: 'Canada', currency: 'cad' },
  { label: 'Europe', currency: 'eur' },
  { label: 'Germany', currency: 'eur' },
  { label: 'Global', currency: 'usd' },
  { label: 'Ireland', currency: 'eur' },
  { label: 'Malta', currency: 'eur' },
  { label: 'Netherlands', currency: 'eur' },
  { label: 'New Zealand', currency: 'nzd' },
  { label: 'South Africa', currency: 'zar' },
  { label: 'Switzerland', currency: 'chf' },
  { label: 'United Kingdom', currency: 'gbp' },
  { label: 'United States', currency: 'usd' },
]

const SORT_OPTIONS = [
  {
    label: 'Relevance',
    value: '_text_match:desc',
  },
  {
    label: 'Price (low to high)',
    value: 'price_usd:asc',
  },
  {
    label: 'Price (high to low)',
    value: 'price_usd:desc',
  },
  {
    label: 'Duration (short to long)',
    value: 'duration:asc',
  },
]

const SEARCH_FIELDS =
  'name,primaryCountry,destinations,marketingRegions,styles,locations,startCity,endCity,themes'

const FACET_FIELDS = 'marketingRegions,styles,hasPlacesLeft'

const DEFAULT_FILTERS = {
  marketingRegion: 'all',
  style: 'all',
  availability: 'all',
}

function formatRating(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return '0.0'
  }

  return numericValue.toFixed(2)
}

function formatPlacesLeft(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return '0'
  }

  return numericValue.toLocaleString()
}

function getLowestPrice(lowestPrice, currencyCode = 'usd') {
  if (!lowestPrice || typeof lowestPrice !== 'object') {
    return null
  }

  // Get price for the requested currency
  const priceData = lowestPrice[currencyCode] || lowestPrice.usd || Object.values(lowestPrice)[0]
  
  if (!priceData) {
    return null
  }

  // Return discount price if on sale, otherwise regular price
  const price = priceData.onSale && priceData.discountPrice 
    ? priceData.discountPrice 
    : priceData.price

  return {
    price: price,
    currency: priceData.currencyCode || currencyCode.toUpperCase(),
    onSale: priceData.onSale ?? false,
  }
}

function getPrimaryValue(values, fallback = 'Unknown') {
  if (Array.isArray(values) && values.length > 0) {
    return values[0]
  }

  return fallback
}

function getFacetOptions(facetCounts, fieldName) {
  const field = facetCounts.find((facet) => facet.field_name === fieldName)

  if (!field || !Array.isArray(field.counts)) {
    return []
  }

  return field.counts
    .map((entry) => ({
      label: String(entry.value),
      count: entry.count,
    }))
    .filter((entry) => entry.label && entry.label !== 'null' && entry.label !== 'undefined')
}

function buildFilterBy(filters) {
  const clauses = []

  if (filters.marketingRegion !== 'all') {
    clauses.push(`marketingRegions:=${filters.marketingRegion}`)
  }

  if (filters.style !== 'all') {
    clauses.push(`styles:=${filters.style}`)
  }

  if (filters.availability === 'available') {
    clauses.push('hasPlacesLeft:=true && closedForBooking:=false')
  }

  if (filters.availability === 'sold-out') {
    clauses.push('hasPlacesLeft:=false || closedForBooking:=true')
  }

  return clauses.join(' && ')
}

function buildSearchQuery(query, sortBy, filters) {
  const searchQuery = query.trim() ? query.trim() : '*'
  const filterBy = buildFilterBy(filters)

  const searchParameters = {
    q: searchQuery,
    query_by: SEARCH_FIELDS,
    facet_by: FACET_FIELDS,
    max_facet_values: 50,
    per_page: 12,
    sort_by: sortBy,
  }

  if (filterBy) {
    searchParameters.filter_by = filterBy
  }

  return searchParameters
}

function FilterOption({ label, count, active, onClick }) {
  return (
    <label className={active ? 'filter-option active' : 'filter-option'}>
      <input
        type="checkbox"
        checked={active}
        onChange={onClick}
        aria-label={label}
      />
      <span className="filter-option-label">{label}</span>
      {typeof count === 'number' ? <span className="filter-option-count">{count}</span> : null}
    </label>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].value)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [selectedRegion, setSelectedRegion] = useState('Germany')
  const [trips, setTrips] = useState([])
  const [facetCounts, setFacetCounts] = useState([])
  const [totalFound, setTotalFound] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedCurrency = useMemo(() => {
    const region = REGION_CONFIG.find((r) => r.label === selectedRegion)
    return region?.currency || 'usd'
  }, [selectedRegion])

  // Get the appropriate sort field based on selected currency
  const adjustedSortBy = useMemo(() => {
    if (!sortBy.includes('price_')) {
      return sortBy
    }
    // Replace the default USD price field with the selected currency's field
    const currencyField = `price_${selectedCurrency}`
    const direction = sortBy.includes(':asc') ? ':asc' : ':desc'
    return `${currencyField}${direction}`
  }, [sortBy, selectedCurrency])

  const marketingRegionOptions = useMemo(
    () => getFacetOptions(facetCounts, 'marketingRegions'),
    [facetCounts],
  )

  const styleOptions = useMemo(
    () => getFacetOptions(facetCounts, 'styles'),
    [facetCounts],
  )

  useEffect(() => {
    let isActive = true

    const runSearch = async () => {
      setIsLoading(true)
      setError('')

      try {
        const response = await client
          .collections('travel_departures')
          .documents()
          .search(buildSearchQuery(query, adjustedSortBy, filters))

        if (!isActive) {
          return
        }

        const documents = Array.isArray(response.hits)
          ? response.hits.map((hit) => hit.document)
          : []

        setTrips(documents)
        setTotalFound(response.found ?? documents.length)
        setFacetCounts(response.facet_counts ?? [])
      } catch (searchError) {
        if (!isActive) {
          return
        }

        setError(
          searchError?.message || 'Unable to load trips from Typesense right now.',
        )
        setTrips([])
        setTotalFound(0)
        setFacetCounts([])
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    const timer = window.setTimeout(() => {
      runSearch()
    }, 200)

    return () => {
      isActive = false
      window.clearTimeout(timer)
    }
  }, [query, adjustedSortBy, filters, selectedCurrency])

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const hasResults = trips.length > 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo">
            <span className="logo-mark" aria-hidden="true">
              T
            </span>
            <div>
              <span className="logo-title">Typesense Travel POC</span>
            </div>
          </div>

          <nav className="nav-links" aria-label="Primary">
            <a href="#results">Destinations</a>
            <a href="#results">Ways to travel</a>
            <a href="#results">Deals</a>
            <a href="#results">About</a>
          </nav>

          <div className="topbar-actions">
            <button type="button" className="icon-button" aria-label="Saved trips">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 20.5l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 5 4 3 6.5 3c1.74 0 3.41.81 4.5 2.09C12.09 3.81 13.76 3 15.5 3 18 3 20 5 20 7.5c0 3.78-3.4 6.86-8.55 11.68L12 20.5z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button type="button" className="icon-button" aria-label="Profile">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button type="button" className="icon-button" aria-label="Support">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 1a9 9 0 00-9 9v3a2 2 0 002 2h1v-6H5a7 7 0 0114 0h-1v6h1a2 2 0 002-2v-3a9 9 0 00-9-9z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="breadcrumb" aria-label="Breadcrumb">
          <span>Home</span>
          <span className="breadcrumb-divider" aria-hidden="true">&gt;</span>
          <span className="breadcrumb-current">Search</span>
        </section>

        <section className="search-strip" aria-label="Search">
          <div className="search-count">
            <strong>{isLoading ? '...' : totalFound.toLocaleString()}</strong> trips found
          </div>
          <div className="search-pill">
            <div className="search-input">
              <span className="search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M11 2a9 9 0 106.32 15.32l3.18 3.18 1.5-1.5-3.18-3.18A9 9 0 0011 2zm0 2a7 7 0 110 14 7 7 0 010-14z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <input
                type="search"
                placeholder="Search destination, trip name, city, or style"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search trips"
              />
            </div>

            <div className="search-divider" aria-hidden="true" />

            <div className="search-dates">
              <span className="calendar-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 8H5v9h14v-9z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <input type="text" placeholder="Start date" aria-label="Start date" />
              <span aria-hidden="true">to</span>
              <input type="text" placeholder="End date" aria-label="End date" />
            </div>

            <button type="button" className="search-button">
              <span>Search</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M11 2a9 9 0 106.32 15.32l3.18 3.18 1.5-1.5-3.18-3.18A9 9 0 0011 2zm0 2a7 7 0 110 14 7 7 0 010-14z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </section>

        <section className="results" id="results" aria-live="polite">
          <div className="results-toolbar">
            <div className="sort-control">
              <span>Sort by</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="results-layout">
            <aside className="filters">
              <div className="filter-block">
                <div className="filter-header">
                  <h3>Destinations</h3>
                  <button type="button" onClick={() => setFilters((current) => ({ ...current, marketingRegion: 'all' }))}>
                    Clear
                  </button>
                </div>
                <div className="filter-options">
                  {marketingRegionOptions.map((option) => (
                    <FilterOption
                      key={option.label}
                      label={option.label}
                      count={option.count}
                      active={filters.marketingRegion === option.label}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          marketingRegion: option.label,
                        }))
                      }
                    />
                  ))}
                </div>
                <button type="button" className="filter-apply">
                  Apply
                </button>
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Duration</h3>
                  <button type="button">Any</button>
                </div>
                <div className="filter-range">
                  <label>
                    Min
                    <select defaultValue="Any">
                      <option>Any</option>
                      <option>3</option>
                      <option>7</option>
                      <option>10</option>
                      <option>14</option>
                    </select>
                  </label>
                  <span>to</span>
                  <label>
                    Max
                    <select defaultValue="Any">
                      <option>Any</option>
                      <option>10</option>
                      <option>14</option>
                      <option>21</option>
                      <option>30</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Price</h3>
                  <button type="button">Any</button>
                </div>
                <div className="filter-range">
                  <label>
                    Min
                    <input type="text" placeholder="€" />
                  </label>
                  <span>to</span>
                  <label>
                    Max
                    <input type="text" placeholder="€" />
                  </label>
                </div>
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Travel deals</h3>
                </div>
                <div className="filter-options">
                  <label className="filter-option">
                    <input type="checkbox" />
                    <span className="filter-option-label">Trips on sale</span>
                  </label>
                  <label className="filter-option">
                    <input type="checkbox" />
                    <span className="filter-option-label">Early bird</span>
                  </label>
                  <label className="filter-option">
                    <input type="checkbox" />
                    <span className="filter-option-label">Last minute deals</span>
                  </label>
                </div>
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Styles</h3>
                  <button type="button" onClick={() => setFilters((current) => ({ ...current, style: 'all' }))}>
                    Clear
                  </button>
                </div>
                <div className="filter-options">
                  {styleOptions.map((option) => (
                    <FilterOption
                      key={option.label}
                      label={option.label}
                      count={option.count}
                      active={filters.style === option.label}
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          style: option.label,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Physical rating</h3>
                </div>
                <div className="rating-toggle">
                  <span>Physical rating</span>
                  <div className="rating-bars" aria-hidden="true">
                    <span className="bar filled" />
                    <span className="bar filled" />
                    <span className="bar filled" />
                    <span className="bar" />
                    <span className="bar" />
                  </div>
                </div>
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Themes</h3>
                </div>
                <div className="filter-options">
                  <label className="filter-option">
                    <input type="checkbox" />
                    <span className="filter-option-label">Wildlife</span>
                  </label>
                  <label className="filter-option">
                    <input type="checkbox" />
                    <span className="filter-option-label">Walking & hiking</span>
                  </label>
                  <label className="filter-option">
                    <input type="checkbox" />
                    <span className="filter-option-label">Family</span>
                  </label>
                </div>
              </div>

              <button type="button" className="clear-all" onClick={clearFilters}>
                Reset all filters
              </button>
            </aside>

            <div className="results-cards">
              {error ? <div className="state state-error">{error}</div> : null}

              {isLoading ? <div className="state">Loading live departures...</div> : null}

              {!isLoading && !error && !hasResults ? (
                <div className="state state-empty">
                  <h3>No departures match this search.</h3>
                  <p>Try widening the region or style filters, or reset the view to see everything.</p>
                </div>
              ) : null}

              {!isLoading && !error && hasResults ? (
                <div className="cards-grid">
                  {trips.map((trip, index) => (
                    <article key={trip.id} className="trip-card">
                      <div className={`card-image ${CARD_IMAGES[index % CARD_IMAGES.length]}`} />
                      <div className="card-body">
                        <div className="card-meta">
                          <span className="rating">
                            {formatRating(trip.reviewRating)}
                            <span>({trip.reviewCount ?? 0})</span>
                          </span>
                          <button type="button" className="icon-button" aria-label="Save trip">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M12 20.5l-1.45-1.32C5.4 14.36 2 11.28 2 7.5 2 5 4 3 6.5 3c1.74 0 3.41.81 4.5 2.09C12.09 3.81 13.76 3 15.5 3 18 3 20 5 20 7.5c0 3.78-3.4 6.86-8.55 11.68L12 20.5z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>

                        <h3>{trip.name}</h3>
                        <p className="card-subtitle">
                          {trip.duration} days · {trip.primaryCountry || 'Unknown country'}
                        </p>

                        <div className="chip-row">
                          <span className="trip-chip">{getPrimaryValue(trip.marketingRegions)}</span>
                          <span className="trip-chip">{getPrimaryValue(trip.styles)}</span>
                          <span className="trip-chip">{trip.startCity || 'Start city'}</span>
                        </div>

                        <div className="rating-toggle card-rating">
                          <span>Physical rating</span>
                          <div className="rating-bars" aria-hidden="true">
                            <span className="bar filled" />
                            <span className="bar filled" />
                            <span className="bar filled" />
                            <span className="bar" />
                            <span className="bar" />
                          </div>
                        </div>

                        <div className="card-metrics">
                          <div>
                            <span>Marketing rating</span>
                            <strong>{trip.marketingRating}</strong>
                          </div>
                          <div>
                            <span>Places left</span>
                            <strong>{formatPlacesLeft(trip.placesLeft)}</strong>
                          </div>
                        </div>

                        <div className="card-actions">
                          <button type="button" className="compare-button">
                            + Add to compare
                          </button>
                          <button type="button" className="icon-button" aria-label="Compare">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M7 4h2v16H7V4zm8 0h2v16h-2V4z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>

                        {getLowestPrice(trip.lowestPrice, selectedCurrency)?.price ? (
                          <div className="price-row">
                            <div className="price-text">
                              <span>From</span>
                              <strong>
                                {getLowestPrice(trip.lowestPrice, selectedCurrency).currency}{' '}
                                {Math.round(getLowestPrice(trip.lowestPrice, selectedCurrency).price)}
                              </strong>
                            </div>
                            <div className="price-meta">Lowest price next departure</div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="region-selector" aria-label="Select region">
          <label htmlFor="region-dropdown">Change region</label>
          <select
            id="region-dropdown"
            value={selectedRegion}
            onChange={(event) => setSelectedRegion(event.target.value)}
            className="region-dropdown"
          >
            {REGION_CONFIG.map((region) => (
              <option key={region.label} value={region.label}>
                {region.label}
              </option>
            ))}
          </select>
        </section>
      </main>
    </div>
  )
}

export default App
