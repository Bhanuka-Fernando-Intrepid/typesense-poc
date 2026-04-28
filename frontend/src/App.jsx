import { useEffect, useMemo, useState } from 'react'
import Typesense from 'typesense'
import './App.css'

const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: 'localhost',
      port: 8108,
      protocol: 'http',
    },
  ],
  apiKey: 'xyz',
  connectionTimeoutSeconds: 5,
})

const CARD_IMAGES = ['image-1', 'image-2', 'image-3', 'image-4']

const SORT_OPTIONS = [
  {
    label: 'Top rated by marketing',
    value: 'marketingRating:desc',
  },
  {
    label: 'Best review score',
    value: 'reviewRating:desc',
  },
  {
    label: 'Shortest duration',
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
    <button
      type="button"
      className={active ? 'filter-option active' : 'filter-option'}
      onClick={onClick}
    >
      <span className="filter-option-label">{label}</span>
      {typeof count === 'number' ? <span className="filter-option-count">{count}</span> : null}
    </button>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].value)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [trips, setTrips] = useState([])
  const [facetCounts, setFacetCounts] = useState([])
  const [totalFound, setTotalFound] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

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
        const response = await typesenseClient
          .collections('travel_departures')
          .documents()
          .search(buildSearchQuery(query, sortBy, filters))

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
  }, [query, sortBy, filters])

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
  }

  const hasResults = trips.length > 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark" aria-hidden="true">
            T
          </span>
          <div>
            <span className="logo-title">Typesense Travel POC</span>
            <span className="logo-subtitle">Departure discovery demo</span>
          </div>
        </div>

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
          <a className="cta" href="#results">
            Explore trips
          </a>
        </div>
      </header>

      <main>
        <section className="search-strip" aria-label="Search">
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
            <button type="button" className="search-button">
              Search
            </button>
          </div>

          <div className="search-metrics">
            <div>
              <strong>{isLoading ? '...' : totalFound.toLocaleString()}</strong>
              <span>trips indexed</span>
            </div>
            <div>
              <strong>{trips.length}</strong>
              <span>results shown</span>
            </div>
            <div>
              <strong>{filters.availability === 'available' ? 'Open' : 'Live'}</strong>
              <span>availability</span>
            </div>
          </div>
        </section>

        <section className="results" id="results" aria-live="polite">
          <div className="results-header">
            <div>
              <p className="eyebrow">Search</p>
              <h2>{isLoading ? 'Loading trips...' : `${totalFound.toLocaleString()} trips found`}</h2>
            </div>
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
                  <h3>Marketing region</h3>
                  <button type="button" onClick={() => setFilters((current) => ({ ...current, marketingRegion: 'all' }))}>
                    Clear
                  </button>
                </div>
                <div className="filter-options">
                  <FilterOption
                    label="All regions"
                    count={totalFound}
                    active={filters.marketingRegion === 'all'}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        marketingRegion: 'all',
                      }))
                    }
                  />
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
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Style</h3>
                  <button type="button" onClick={() => setFilters((current) => ({ ...current, style: 'all' }))}>
                    Clear
                  </button>
                </div>
                <div className="filter-options">
                  <FilterOption
                    label="All styles"
                    active={filters.style === 'all'}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        style: 'all',
                      }))
                    }
                  />
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
                  <h3>Places left</h3>
                </div>
                <div className="availability-toggle" role="group" aria-label="Places left">
                  <button
                    type="button"
                    className={filters.availability === 'all' ? 'toggle active' : 'toggle'}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        availability: 'all',
                      }))
                    }
                  >
                    Any
                  </button>
                  <button
                    type="button"
                    className={filters.availability === 'available' ? 'toggle active' : 'toggle'}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        availability: 'available',
                      }))
                    }
                  >
                    Places left
                  </button>
                  <button
                    type="button"
                    className={filters.availability === 'sold-out' ? 'toggle active' : 'toggle'}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        availability: 'sold-out',
                      }))
                    }
                  >
                    Sold out
                  </button>
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

                        <div className="card-footer">
                          <span className="pill">{trip.closedForBooking ? 'Closed' : 'Open now'}</span>
                          <span className="pill">{trip.endCity || 'End city'}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
