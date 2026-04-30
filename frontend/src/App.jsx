import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import Typesense from 'typesense'
import './App.css'

const TYPESENSE_HOST = import.meta.env.VITE_TYPESENSE_HOST || "";
const TYPESENSE_PORT = Number(import.meta.env.VITE_TYPESENSE_PORT) || 443;
const TYPESENSE_PROTOCOL = import.meta.env.VITE_TYPESENSE_PROTOCOL || "https";
const TYPESENSE_API_KEY = import.meta.env.VITE_TYPESENSE_SEARCH_API_KEY || import.meta.env.VITE_TYPESENSE_API_KEY || "";
const TYPESENSE_COLLECTION = import.meta.env.VITE_TYPESENSE_COLLECTION || "dev_intrepid_departure";
const TYPESENSE_READY = Boolean(TYPESENSE_HOST && TYPESENSE_API_KEY && TYPESENSE_COLLECTION);

const client = new Typesense.Client({
  nodes: [
    {
      host: TYPESENSE_HOST,
      port: TYPESENSE_PORT,
      protocol: TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 2,
});

const ASSET_BASE_URL = import.meta.env.VITE_ASSET_BASE_URL || "https://www.intrepidtravel.com";

function buildAssetUrl(url) {
  if (!url) {
    return "";
  }
  if (url.startsWith("http")) {
    return url;
  }
  return `${ASSET_BASE_URL}${url}`;
}

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
  { label: 'Relevance', value: 'relevance' },
  { label: 'Price (low to high)', value: 'price_asc' },
  { label: 'Price (high to low)', value: 'price_desc' },
  { label: 'Duration (short to long)', value: 'duration_asc' },
  { label: 'Duration (long to short)', value: 'duration_desc' },
  { label: 'Rating', value: 'rating_desc' },
  { label: 'Soonest departure', value: 'startDate_asc' },
]

const SEARCH_FIELDS =
  'name,primaryCountry,destinations,locations,marketingRegions,themes,styles'

const FACET_FIELDS = 'marketingRegions,styles'

// UI -> stored value mapping for styles/themes where display differs from stored data
const STYLE_UI_TO_VALUE = {
  Basix: 'Basic',
}
const STYLE_VALUE_TO_UI = Object.fromEntries(Object.entries(STYLE_UI_TO_VALUE).map(([k,v]) => [v,k]))

const DEFAULT_FILTERS = {
  marketingRegion: 'all',
  style: 'all',
  availability: 'all',
  durationMin: '',
  durationMax: '',
  priceMin: '',
  priceMax: '',
  onSale: false,
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

function toDateLabel(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return 'TBD'
  }

  const normalizedValue = numericValue < 1e12 ? numericValue * 1000 : numericValue
  return new Date(normalizedValue).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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
    originalPrice: priceData.price,
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

function buildFilterBy(selectedFilters, selectedCurrency) {
  const clauses = []

  const escapeBackticks = (s) => String(s).replace(/`/g, "\\`")

  if (Array.isArray(selectedFilters.marketingRegions) && selectedFilters.marketingRegions.length > 0) {
    const vals = selectedFilters.marketingRegions.map((v) => `\`${escapeBackticks(v)}\``).join(',')
    clauses.push(`marketingRegions:=[${vals}]`)
  }

  if (Array.isArray(selectedFilters.styles) && selectedFilters.styles.length > 0) {
    const vals = selectedFilters.styles.map((v) => `\`${escapeBackticks(v)}\``).join(',')
    clauses.push(`styles:=[${vals}]`)
  }

  if (Array.isArray(selectedFilters.themes) && selectedFilters.themes.length > 0) {
    const vals = selectedFilters.themes.map((v) => `\`${escapeBackticks(v)}\``).join(',')
    clauses.push(`themes:=[${vals}]`)
  }

  if (Array.isArray(selectedFilters.physicalRating) && selectedFilters.physicalRating.length > 0) {
    const vals = selectedFilters.physicalRating.map((v) => `\`${escapeBackticks(String(v))}\``).join(',')
    clauses.push(`physicalRating:=[${vals}]`)
  }

  if (selectedFilters.durationMin) clauses.push(`duration:>=${selectedFilters.durationMin}`)
  if (selectedFilters.durationMax) clauses.push(`duration:<=${selectedFilters.durationMax}`)
  if (selectedFilters.priceMin) clauses.push(`lowestPrice.${selectedCurrency}.price:>=${selectedFilters.priceMin}`)
  if (selectedFilters.priceMax) clauses.push(`lowestPrice.${selectedCurrency}.price:<=${selectedFilters.priceMax}`)

  if (selectedFilters.startDate) {
    // selectedFilters.startDate expected as yyyy-mm-dd from the date input; convert to epoch seconds used in index
    const ts = Math.floor(new Date(selectedFilters.startDate).getTime() / 1000)
    if (!Number.isNaN(ts)) clauses.push(`startDate:>=${ts}`)
  }

  if (selectedFilters.onSale) clauses.push(`lowestPrice.${selectedCurrency}.onSale:=true`)
  if (selectedFilters.newTrips) clauses.push(`isNew:=true`)

  return clauses.join(' && ')
}

function buildSearchQuery(query, sortBy, filters, selectedCurrency) {
  const searchQuery = query.trim() ? query.trim() : '*'
  const filterBy = buildFilterBy(filters, selectedCurrency)

  const searchParameters = {
    q: searchQuery,
    query_by: SEARCH_FIELDS,
    max_facet_values: 50,
    per_page: 250,
    sort_by: sortBy,
  }

  // Note: facet_by disabled if fields are not marked as facets in schema
  // if (FACET_FIELDS) {
  //   searchParameters.facet_by = FACET_FIELDS
  // }

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

function ProductSearchPage({ selectedCurrency }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const searchContainerRef = useRef(null)
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].value)
  // appliedFilters are sent to Typesense; pendingDestinations used for Apply behavior
  const [appliedFilters, setAppliedFilters] = useState({
    marketingRegions: [],
    styles: [],
    themes: [],
    physicalRating: [],
    durationMin: '',
    durationMax: '',
    priceMin: '',
    priceMax: '',
    startDate: '',
    onSale: false,
    newTrips: false,
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [pendingDestinations, setPendingDestinations] = useState([])
  const [products, setProducts] = useState([])
  const [facetCounts, setFacetCounts] = useState([])
  const [totalFound, setTotalFound] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const adjustedSortBy = useMemo(() => {
    switch (sortBy) {
      case 'relevance':
        return '_text_match:desc'
      case 'price_asc':
        return `lowestPrice.${selectedCurrency}.price:asc`
      case 'price_desc':
        return `lowestPrice.${selectedCurrency}.price:desc`
      case 'duration_asc':
        return 'duration:asc'
      case 'duration_desc':
        return 'duration:desc'
      case 'rating_desc':
        return 'reviewRating:desc'
      case 'startDate_asc':
        return 'startDate:asc'
      default:
        return '_text_match:desc'
    }
  }, [sortBy, selectedCurrency])

  const marketingRegionOptions = useMemo(() => {
    // Compute counts from unique products so facet counts reflect product counts
    const regionMap = new Map()
    products.forEach((product) => {
      if (Array.isArray(product.marketingRegions)) {
        // count each product once per region
        const unique = Array.from(new Set(product.marketingRegions))
        unique.forEach((region) => {
          regionMap.set(region, (regionMap.get(region) || 0) + 1)
        })
      }
    })

    // Ensure selected applied and pending values remain visible
    ;[...appliedFilters.marketingRegions, ...pendingDestinations].forEach((v) => {
      if (v && !regionMap.has(v)) regionMap.set(v, 0)
    })

    return Array.from(regionMap).map(([label, count]) => ({ label, count }))
  }, [facetCounts, products, appliedFilters.marketingRegions, pendingDestinations])

  const styleOptions = useMemo(() => {
    // Compute counts from unique products and normalize UI labels
    const styleMap = new Map()
    products.forEach((product) => {
      if (Array.isArray(product.styles)) {
        const unique = Array.from(new Set(product.styles))
        unique.forEach((styleVal) => {
          // normalize stored value to UI label if needed
          const uiLabel = STYLE_VALUE_TO_UI[styleVal] || styleVal
          styleMap.set(uiLabel, (styleMap.get(uiLabel) || 0) + 1)
        })
      }
    })

    // Ensure selected visible (appliedFilters stores stored-values)
    appliedFilters.styles.forEach((storedVal) => {
      const uiLabel = STYLE_VALUE_TO_UI[storedVal] || storedVal
      if (uiLabel && !styleMap.has(uiLabel)) styleMap.set(uiLabel, 0)
    })

    return Array.from(styleMap).map(([label, count]) => ({ label, count }))
  }, [facetCounts, products, appliedFilters.styles])

  const themeOptions = useMemo(() => {
    const map = new Map()
    products.forEach((product) => {
      if (Array.isArray(product.themes)) {
        const unique = Array.from(new Set(product.themes))
        unique.forEach((t) => map.set(t, (map.get(t) || 0) + 1))
      }
    })
    appliedFilters.themes.forEach((v) => { if (v && !map.has(v)) map.set(v, 0) })
    return Array.from(map).map(([label, count]) => ({ label, count }))
  }, [products, appliedFilters.themes])

  const physicalCounts = useMemo(() => {
    const map = new Map()
    products.forEach((product) => {
      const val = product.physicalRating
      if (val !== undefined && val !== null) {
        map.set(val, (map.get(val) || 0) + 1)
      }
    })
    return map
  }, [products])

  const onSaleCount = useMemo(() => {
    let c = 0
    products.forEach((product) => {
      const lp = product.lowestPrice
      if (!lp) return
      const pData = (lp && lp[selectedCurrency]) || lp.usd || Object.values(lp)[0]
      if (pData && pData.onSale) c += 1
    })
    return c
  }, [products, selectedCurrency])

  useEffect(() => {
    let isActive = true

    const runSearch = async () => {
      setIsLoading(true)
      setError('')

      if (!TYPESENSE_READY) {
        setError('Typesense config missing. Check VITE_TYPESENSE_HOST, VITE_TYPESENSE_API_KEY, and VITE_TYPESENSE_COLLECTION.')
        setProducts([])
        setTotalFound(0)
        setFacetCounts([])
        setIsLoading(false)
        return
      }

      try {
        const response = await client
          .collections(TYPESENSE_COLLECTION)
          .documents()
          .search({
            ...buildSearchQuery(query, adjustedSortBy, appliedFilters, selectedCurrency),
            facet_by: 'marketingRegions,styles,themes,physicalRating,productId',
            max_facet_values: 2000,
          })

        if (!isActive) {
          return
        }

        const documents = Array.isArray(response.hits)
          ? response.hits.map((hit) => hit.document)
          : []
        const groupedMap = new Map()
        documents.forEach((doc) => {
          const key = doc.productId ?? doc.id
          if (!groupedMap.has(key)) {
            groupedMap.set(key, doc)
          }
        })
        const groupedDocuments = Array.from(groupedMap.values())

        setProducts(groupedDocuments)
        // Prefer productId facet counts (unique products) if present, otherwise fallback
        const productFacet = (response.facet_counts || []).find((f) => f.field_name === 'productId')
        const uniqueProducts = productFacet && Array.isArray(productFacet.counts) ? productFacet.counts.length : groupedDocuments.length
        setTotalFound(uniqueProducts)
        setFacetCounts(response.facet_counts ?? [])
      } catch (searchError) {
        if (!isActive) {
          return
        }

        setError(
          searchError?.message || 'Unable to load products from Typesense right now.',
        )
        setProducts([])
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
    }, 300)

    return () => {
      isActive = false
      window.clearTimeout(timer)
    }
  }, [query, adjustedSortBy, appliedFilters, selectedCurrency])

  // Suggestions fetching (debounced shorter than main search)
  useEffect(() => {
    if (!query || query.trim().length < 2 || !TYPESENSE_READY) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    let isActive = true
    const fetchSuggestions = async () => {
      try {
        const params = {
          q: query.trim(),
          query_by: 'primaryCountry,destinations,locations,regions,name',
          query_by_weights: '5,4,3,2,1',
          per_page: 8,
          include_fields: 'name,primaryCountry,destinations,locations,regions',
          prefix: true,
        }

        const res = await client.collections(TYPESENSE_COLLECTION).documents().search(params)
        if (!isActive) return

        const hits = Array.isArray(res.hits) ? res.hits.map((h) => h.document) : []
        const qLower = query.trim().toLowerCase()
        const items = []
        const seen = new Set()

        const pushIf = (str) => {
          if (!str) return
          const s = String(str).trim()
          const key = s.toLowerCase()
          if (!key || seen.has(key)) return
          if (qLower && key.indexOf(qLower) === -1) return
          seen.add(key)
          items.push(s)
        }

        // Priority: primaryCountry -> destinations -> locations -> regions -> name
        for (const doc of hits) {
          if (items.length >= 5) break
          pushIf(doc.primaryCountry)
        }

        if (items.length < 5) {
          for (const doc of hits) {
            if (items.length >= 5) break
            if (Array.isArray(doc.destinations)) {
              for (const d of doc.destinations) {
                pushIf(d)
                if (items.length >= 5) break
              }
            }
          }
        }

        if (items.length < 5) {
          for (const doc of hits) {
            if (items.length >= 5) break
            if (Array.isArray(doc.locations)) {
              for (const l of doc.locations) {
                pushIf(l)
                if (items.length >= 5) break
              }
            }
          }
        }

        if (items.length < 5) {
          for (const doc of hits) {
            if (items.length >= 5) break
            if (Array.isArray(doc.regions)) {
              for (const r of doc.regions) {
                pushIf(r)
                if (items.length >= 5) break
              }
            }
          }
        }

        // Trip names: avoid short/common-word matches. Only include if query length >=3
        if (qLower.length >= 3 && items.length < 5) {
          for (const doc of hits) {
            if (items.length >= 5) break
            pushIf(doc.name)
          }
        }

        setSuggestions(items.slice(0, 5))
        setShowSuggestions(items.length > 0)
        setSelectedSuggestionIndex(-1)
      } catch (err) {
        console.error('Suggestion fetch error', err)
        setSuggestions([])
        setShowSuggestions(false)
      }
    }

    const t = window.setTimeout(() => fetchSuggestions(), 300)

    return () => {
      isActive = false
      window.clearTimeout(t)
    }
  }, [query])

  // Click outside to close suggestions
  useEffect(() => {
    const onDocClick = (e) => {
      if (!searchContainerRef.current) return
      if (!searchContainerRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const clearFilters = () => {
    setAppliedFilters({
      marketingRegions: [],
      styles: [],
      themes: [],
      physicalRating: [],
      durationMin: '',
      durationMax: '',
      priceMin: '',
      priceMax: '',
      startDate: '',
      onSale: false,
      newTrips: false,
    })
    setPendingDestinations([])
  }

  // Restore state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q') || ''
    const regions = params.get('regions')
    const styles = params.get('styles')
    const themes = params.get('themes')
    const physical = params.get('physical')
    const durationMin = params.get('durationMin') || ''
    const durationMax = params.get('durationMax') || ''
    const startDate = params.get('startDate') || ''
    const sort = params.get('sort') || sortBy

    if (q) setQuery(q)
    setSortBy(sort)
    setAppliedFilters((c) => ({
      ...c,
      marketingRegions: regions ? regions.split(',').filter(Boolean) : c.marketingRegions,
      styles: styles ? styles.split(',').filter(Boolean) : c.styles,
      themes: themes ? themes.split(',').filter(Boolean) : c.themes,
      physicalRating: physical ? physical.split(',').map((v) => Number(v)).filter(Boolean) : c.physicalRating,
      durationMin,
      durationMax,
      startDate,
    }))
    if (regions) setPendingDestinations(regions.split(',').filter(Boolean))
  }, [])

  // Push state to URL when key params change
  useEffect(() => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (appliedFilters.marketingRegions.length) params.set('regions', appliedFilters.marketingRegions.join(','))
    if (appliedFilters.styles.length) params.set('styles', appliedFilters.styles.join(','))
    if (appliedFilters.themes.length) params.set('themes', appliedFilters.themes.join(','))
    if (appliedFilters.physicalRating.length) params.set('physical', appliedFilters.physicalRating.join(','))
    if (appliedFilters.durationMin) params.set('durationMin', appliedFilters.durationMin)
    if (appliedFilters.durationMax) params.set('durationMax', appliedFilters.durationMax)
    if (appliedFilters.startDate) params.set('startDate', appliedFilters.startDate)
    if (sortBy) params.set('sort', sortBy)
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)
  }, [query, appliedFilters, sortBy])

  const [collapsed, setCollapsed] = useState({
    destinations: false,
    duration: false,
    deals: false,
    physical: false,
    styles: false,
    themes: false,
  })

  function toggleCollapse(key) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  function getFacetCount(field, value) {
    const fieldObj = facetCounts.find((f) => f.field_name === field)
    if (!fieldObj || !Array.isArray(fieldObj.counts)) return 0
    const found = fieldObj.counts.find((c) => String(c.value) === String(value))
    return found ? found.count : 0
  }

  const hasResults = products.length > 0

  function renderHighlighted(text, q) {
    if (!q) return text
    const s = String(text)
    const qTrim = q.trim()
    if (!qTrim) return s
    const sLower = s.toLowerCase()
    const qLower = qTrim.toLowerCase()
    const idx = sLower.indexOf(qLower)
    if (idx === -1) return s
    const before = s.slice(0, idx)
    const match = s.slice(idx, idx + qTrim.length)
    const after = s.slice(idx + qTrim.length)
    return (
      <>
        {before}
        <strong>{match}</strong>
        {after}
      </>
    )
  }

  

  return (
    <>
      <section className="breadcrumb" aria-label="Breadcrumb">
        <span>Home</span>
        <span className="breadcrumb-divider" aria-hidden="true">&gt;</span>
        <span className="breadcrumb-current">Search</span>
      </section>

      <section className="search-strip" aria-label="Search">
        <div className="search-count">
          <strong>{isLoading ? '...' : totalFound.toLocaleString()}</strong> trips found
        </div>
        <div className="search-pill" ref={searchContainerRef}>
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
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              onKeyDown={(e) => {
                if (!showSuggestions || suggestions.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSelectedSuggestionIndex((i) => Math.min(suggestions.length - 1, i + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSelectedSuggestionIndex((i) => Math.max(-1, i - 1))
                } else if (e.key === 'Enter') {
                  if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
                    e.preventDefault()
                    const val = suggestions[selectedSuggestionIndex]
                    setQuery(val)
                    setShowSuggestions(false)
                    setSelectedSuggestionIndex(-1)
                  }
                } else if (e.key === 'Escape') {
                  setShowSuggestions(false)
                  setSelectedSuggestionIndex(-1)
                }
              }}
              onFocus={() => { if (query) setShowSuggestions(true) }}
              aria-label="Search trips"
            />
            {query ? (
              <button
                className="clear-query"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  setSuggestions([])
                  setShowSuggestions(false)
                }}
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="search-divider" aria-hidden="true" />

          <button className="filters-toggle" onClick={() => setMobileFiltersOpen((s) => !s)} aria-label="Toggle filters">
            Filters
          </button>

          <div className="search-dates" onClick={() => setShowDatePicker((s) => !s)} role="button" tabIndex={0} aria-label="Start date">
            <span className="calendar-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 8H5v9h14v-9z" fill="currentColor" />
              </svg>
            </span>
            <div className="start-date-label">{appliedFilters.startDate ? new Date(appliedFilters.startDate).toLocaleDateString() : 'Start date'}</div>
            {showDatePicker ? (
              <input
                type="date"
                className="start-date-picker"
                value={appliedFilters.startDate || ''}
                onChange={(e) => {
                  const v = e.target.value
                  setAppliedFilters((c) => ({ ...c, startDate: v }))
                  setShowDatePicker(false)
                }}
              />
            ) : null}
          </div>

          <button type="button" className="search-button" onClick={() => { /* visual-only, main search reacts to query */ }}>
            <span>Search</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M11 2a9 9 0 106.32 15.32l3.18 3.18 1.5-1.5-3.18-3.18A9 9 0 0011 2zm0 2a7 7 0 110 14 7 7 0 010-14z"
                fill="currentColor"
              />
            </svg>
          </button>

          {showSuggestions && suggestions.length > 0 ? (
            <div className="suggestions-dropdown" role="listbox">
              <div className="suggestions-title">SUGGESTED SEARCHES</div>
              <ul>
                {suggestions.map((sug, idx) => (
                  <li
                    key={sug}
                    className={"suggestion-item" + (idx === selectedSuggestionIndex ? ' selected' : '')}
                    role="option"
                    aria-selected={idx === selectedSuggestionIndex}
                    onMouseDown={(e) => {
                      // prevent blur before click
                      e.preventDefault()
                      setQuery(sug)
                      setShowSuggestions(false)
                      setSelectedSuggestionIndex(-1)
                    }}
                    onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                    onClick={() => { /* click handled onMouseDown */ }}
                  >
                    <span className="suggestion-icon" aria-hidden="true">🔍</span>
                    <span className="suggestion-text">{renderHighlighted(sug, query)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <div className="active-chips">
        {appliedFilters.marketingRegions.map((m) => (
          <div key={`chip-m-${m}`} className="chip">
            <span>{m}</span>
            <button onClick={() => setAppliedFilters((c) => ({ ...c, marketingRegions: c.marketingRegions.filter(x => x !== m) }))}>×</button>
          </div>
        ))}

        {appliedFilters.styles.map((stored) => {
          const label = STYLE_VALUE_TO_UI[stored] || stored
          return (
            <div key={`chip-s-${stored}`} className="chip">
              <span>{label}</span>
              <button onClick={() => setAppliedFilters((c) => ({ ...c, styles: c.styles.filter(x => x !== stored) }))}>×</button>
            </div>
          )
        })}

        {appliedFilters.startDate ? (
          <div key={`chip-date`} className="chip">
            <span>{new Date(appliedFilters.startDate).toLocaleDateString()}</span>
            <button onClick={() => setAppliedFilters((c) => ({ ...c, startDate: '' }))}>×</button>
          </div>
        ) : null}

        {(appliedFilters.marketingRegions.length || appliedFilters.styles.length) ? (
          <button className="clear-all" onClick={clearFilters}>Clear all filters</button>
        ) : null}
      </div>

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
          <aside className={mobileFiltersOpen ? 'filters mobile-open' : 'filters'}>
              {mobileFiltersOpen ? (
                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:8}}>
                  <button className="clear-all" onClick={() => setMobileFiltersOpen(false)}>Close</button>
                </div>
              ) : null}
              <div className="filter-block">
                <div className="filter-header filter-section-header">
                  <div className={collapsed.destinations ? 'collapsible closed' : 'collapsible'} onClick={() => toggleCollapse('destinations')}>
                    <span className="arrow">▾</span>
                    <h3>Destinations</h3>
                  </div>
                  <div>
                    {appliedFilters.marketingRegions.length > 0 ? (
                      <button type="button" onClick={() => { setAppliedFilters((c) => ({ ...c, marketingRegions: [] })); setPendingDestinations([]) }}>Reset</button>
                    ) : null}
                  </div>
                </div>
                {!collapsed.destinations ? (
                  <>
                    <div className="filter-options">
                      {marketingRegionOptions.map((option) => {
                        const checked = pendingDestinations.includes(option.label)
                        return (
                          <label key={option.label} className="filter-option" onClick={() => {
                            setPendingDestinations((current) => current.includes(option.label) ? current.filter(x => x !== option.label) : [...current, option.label])
                          }}>
                            <span className={checked ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true">{checked ? '✓' : ''}</span>
                            <span className="filter-option-label">{option.label}</span>
                            <span className="count-badge">{option.count ?? 0}</span>
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="filter-apply" onClick={() => setAppliedFilters((c) => ({ ...c, marketingRegions: Array.from(new Set(pendingDestinations)) }))}>
                        Apply
                      </button>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="filter-block">
                <div className="filter-header filter-section-header">
                  <div className={collapsed.duration ? 'collapsible closed' : 'collapsible'} onClick={() => toggleCollapse('duration')}>
                    <span className="arrow">▾</span>
                    <h3>Duration</h3>
                  </div>
                  <div>
                    {(appliedFilters.durationMin || appliedFilters.durationMax) ? (
                      <button type="button" onClick={() => setAppliedFilters((c) => ({ ...c, durationMin: '', durationMax: '' }))}>Reset</button>
                    ) : null}
                  </div>
                </div>
                {!collapsed.duration ? (
                  <div className="filter-range">
                    <label>
                      Min
                      <select value={appliedFilters.durationMin} onChange={(event) => setAppliedFilters((c) => ({ ...c, durationMin: event.target.value }))}>
                        <option value="">Any</option>
                        <option value="1">1</option>
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="15">15</option>
                        <option value="20">20</option>
                        <option value="30">30</option>
                      </select>
                    </label>
                    <span>to</span>
                    <label>
                      Max
                      <select value={appliedFilters.durationMax} onChange={(event) => setAppliedFilters((c) => ({ ...c, durationMax: event.target.value }))}>
                        <option value="">Any</option>
                        <option value="1">1</option>
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="15">15</option>
                        <option value="20">20</option>
                        <option value="30">30</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="filter-block">
                <div className="filter-header">
                  <h3>Price ({selectedCurrency.toUpperCase()})</h3>
                  <button type="button" onClick={() => setAppliedFilters((current) => ({ ...current, priceMin: '', priceMax: '' }))}>
                    Any
                  </button>
                </div>
                <div className="filter-range">
                  <label>
                    Min
                    <input type="number" placeholder={`Min ${selectedCurrency.toUpperCase()}`} value={appliedFilters.priceMin} onChange={(event) => setAppliedFilters((current) => ({ ...current, priceMin: event.target.value }))} />
                  </label>
                  <span>to</span>
                  <label>
                    Max
                    <input type="number" placeholder={`Max ${selectedCurrency.toUpperCase()}`} value={appliedFilters.priceMax} onChange={(event) => setAppliedFilters((current) => ({ ...current, priceMax: event.target.value }))} />
                  </label>
                </div>
              </div>

              <div className="filter-block">
                <div className="filter-header filter-section-header">
                  <div className={collapsed.deals ? 'collapsible closed' : 'collapsible'} onClick={() => toggleCollapse('deals')}>
                    <span className="arrow">▾</span>
                    <h3>Travel deals</h3>
                  </div>
                  <div>
                    {(appliedFilters.onSale || appliedFilters.newTrips) ? (
                      <button type="button" onClick={() => setAppliedFilters((c) => ({ ...c, onSale: false, newTrips: false }))}>Reset</button>
                    ) : null}
                  </div>
                </div>
                {!collapsed.deals ? (
                  <div className="filter-options">
                    <label className="filter-option" onClick={() => setAppliedFilters((c) => ({ ...c, onSale: !c.onSale }))}>
                      <span className={appliedFilters.onSale ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true">{appliedFilters.onSale ? '✓' : ''}</span>
                      <span className="filter-option-label">Trips on sale</span>
                      <span className="count-badge">{onSaleCount ?? ''}</span>
                    </label>
                    <label className="filter-option">
                      <span className={false ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true"></span>
                      <span className="filter-option-label">Early bird</span>
                    </label>
                    <label className="filter-option">
                      <span className={false ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true"></span>
                      <span className="filter-option-label">Last minute deals</span>
                    </label>
                    <label className="filter-option" onClick={() => setAppliedFilters((c) => ({ ...c, newTrips: !c.newTrips }))}>
                      <span className={appliedFilters.newTrips ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true">{appliedFilters.newTrips ? '✓' : ''}</span>
                      <span className="filter-option-label">New trips</span>
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="filter-block">
                <div className="filter-header filter-section-header">
                  <div className={collapsed.styles ? 'collapsible closed' : 'collapsible'} onClick={() => toggleCollapse('styles')}>
                    <span className="arrow">▾</span>
                    <h3>Styles</h3>
                  </div>
                  <div>
                    {appliedFilters.styles.length > 0 ? (
                      <button type="button" onClick={() => setAppliedFilters((c) => ({ ...c, styles: [] }))}>Reset</button>
                    ) : null}
                  </div>
                </div>
                {!collapsed.styles ? (
                  <div className="filter-options">
                    {styleOptions.map((opt) => {
                      const uiLabel = opt.label
                      const storedVal = STYLE_UI_TO_VALUE[uiLabel] || uiLabel
                      const checked = appliedFilters.styles.includes(storedVal)
                      return (
                        <label key={uiLabel} className="filter-option" onClick={() => setAppliedFilters((c) => ({ ...c, styles: c.styles.includes(storedVal) ? c.styles.filter(x => x !== storedVal) : [...c.styles, storedVal] }))}>
                          <span className={checked ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true">{checked ? '✓' : ''}</span>
                          <span className="filter-option-label">{uiLabel}</span>
                          <span className="count-badge">{opt.count ?? 0}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="filter-block">
                <div className="filter-header filter-section-header">
                  <div className={collapsed.physical ? 'collapsible closed' : 'collapsible'} onClick={() => toggleCollapse('physical')}>
                    <span className="arrow">▾</span>
                    <h3>Physical rating</h3>
                  </div>
                  <div>
                    {appliedFilters.physicalRating.length > 0 ? (
                      <button type="button" onClick={() => setAppliedFilters((c) => ({ ...c, physicalRating: [] }))}>Reset</button>
                    ) : null}
                  </div>
                </div>
                {!collapsed.physical ? (
                  <div className="filter-options">
                    {[1,2,3,4,5].map((n) => {
                      const checked = appliedFilters.physicalRating.includes(n)
                      return (
                        <label key={n} className="filter-option" onClick={() => setAppliedFilters((c) => ({ ...c, physicalRating: c.physicalRating.includes(n) ? c.physicalRating.filter(x => x !== n) : [...c.physicalRating, n] }))}>
                          <span className={checked ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true">{checked ? '✓' : ''}</span>
                          <span className="filter-option-label">{n} <span style={{color:'var(--ink-muted)', fontWeight:600}}>&nbsp;stars</span></span>
                          <span className="count-badge">{physicalCounts.get(n) ?? 0}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="filter-block">
                <div className="filter-header filter-section-header">
                  <div className={collapsed.themes ? 'collapsible closed' : 'collapsible'} onClick={() => toggleCollapse('themes')}>
                    <span className="arrow">▾</span>
                    <h3>Themes</h3>
                  </div>
                  <div>
                    {appliedFilters.themes.length > 0 ? (
                      <button type="button" onClick={() => setAppliedFilters((c) => ({ ...c, themes: [] }))}>Reset</button>
                    ) : null}
                  </div>
                </div>
                {!collapsed.themes ? (
                  <div className="filter-options">
                    {themeOptions.map((opt) => {
                      const checked = appliedFilters.themes.includes(opt.label)
                      return (
                        <label key={opt.label} className="filter-option" onClick={() => setAppliedFilters((c) => ({ ...c, themes: c.themes.includes(opt.label) ? c.themes.filter(x => x !== opt.label) : [...c.themes, opt.label] }))}>
                          <span className={checked ? 'checkbox-square checked' : 'checkbox-square'} aria-hidden="true">{checked ? '✓' : ''}</span>
                          <span className="filter-option-label">{opt.label}</span>
                          <span className="count-badge">{opt.count ?? 0}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <button type="button" className="clear-all" onClick={clearFilters}>
                Reset all filters
              </button>
            </aside>

          <div className="results-cards">
            {error ? <div className="state state-error">{error}</div> : null}

            {isLoading ? <div className="state">Loading products...</div> : null}

            {!isLoading && !error && !hasResults ? (
              <div className="state state-empty">
                <h3>No products match this search.</h3>
                <p>Try widening the region or style filters, or reset the view to see everything.</p>
              </div>
            ) : null}

            {!isLoading && !error && hasResults ? (
              <div className="cards-grid">
                {products.map((product) => {
                  const heroImage = buildAssetUrl(product.map?.url || product.productImages?.[0]?.url)
                  const heroAlt = product.productImages?.[0]?.alt || product.map?.alt || product.name
                  const priceInfo = getLowestPrice(product.lowestPrice, selectedCurrency)

                  return (
                  <article key={product.productId ?? product.id} className="trip-card">
                    <Link className="card-link" to={`/product/${product.productId}`}>
                      <div
                        className="card-image"
                        style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
                        role="img"
                        aria-label={heroAlt}
                      />
                    </Link>
                    <div className="card-body">
                      <div className="card-meta">
                        <span className="rating">
                          {formatRating(product.reviewRating)}
                          <span>({product.reviewCount ?? 0})</span>
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

                      <Link className="card-title" to={`/product/${product.productId}`}>
                        <h3>{product.name}</h3>
                      </Link>
                      <p className="card-subtitle">
                        {product.duration} days · {product.primaryCountry || 'Unknown country'}
                      </p>

                      <div className="chip-row">
                        <span className="trip-chip">{getPrimaryValue(product.marketingRegions)}</span>
                        <span className="trip-chip">{getPrimaryValue(product.styles)}</span>
                        <span className="trip-chip">{product.startCity || 'Start city'}</span>
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
                          <strong>{product.marketingRating}</strong>
                        </div>
                        <div>
                          <span>Places left</span>
                          <strong>{formatPlacesLeft(product.placesLeft)}</strong>
                        </div>
                      </div>

                      <div className="card-actions">
                        <Link className="compare-button" to={`/product/${product.productId}`}>
                          + View departures
                        </Link>
                        <button type="button" className="icon-button" aria-label="Compare">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M7 4h2v16H7V4zm8 0h2v16h-2V4z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>

                      {priceInfo?.price ? (
                        <div className="price-row">
                          <div className="price-text">
                            <span>From</span>
                            <strong>
                              {priceInfo.currency}{' '}
                              {Math.round(priceInfo.price)}
                            </strong>
                            {priceInfo.onSale && priceInfo.originalPrice && priceInfo.originalPrice > priceInfo.price ? (
                              <div className="product-card-price-compare">{priceInfo.currency} {Math.round(priceInfo.originalPrice)}</div>
                            ) : null}
                          </div>
                          <div className="price-meta">
                            {product.productCode && <div className="product-code">{product.productCode}</div>}
                            <div>Lowest price next departure</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  )
}

function ProductDetailPage({ selectedCurrency }) {
  const { productId } = useParams()
  const [product, setProduct] = useState(null)
  const [departures, setDepartures] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isActive = true

    const loadProduct = async () => {
      setIsLoading(true)
      setError('')

      if (!TYPESENSE_READY) {
        setError('Typesense config missing. Check VITE_TYPESENSE_HOST, VITE_TYPESENSE_API_KEY, and VITE_TYPESENSE_COLLECTION.')
        setProduct(null)
        setDepartures([])
        setIsLoading(false)
        return
      }

      try {
        const departureResponse = await client
          .collections(TYPESENSE_COLLECTION)
          .documents()
          .search({
            q: '*',
            query_by: 'name',
            filter_by: `productId:=${productId}`,
            per_page: 50,
            sort_by: 'startDate:asc',
          })

        if (!isActive) {
          return
        }

        const departureDocs = Array.isArray(departureResponse.hits)
          ? departureResponse.hits.map((hit) => hit.document)
          : []

        const productDocument = departureDocs[0] || null

        if (!productDocument) {
          setProduct(null)
          setDepartures([])
          setError('Product not found.')
          return
        }

        setProduct(productDocument)
        setDepartures(departureDocs)
      } catch (searchError) {
        if (!isActive) {
          return
        }

        setError(searchError?.message || 'Unable to load product details right now.')
        setProduct(null)
        setDepartures([])
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    loadProduct()

    return () => {
      isActive = false
    }
  }, [productId])

  if (isLoading) {
    return <div className="state">Loading product details...</div>
  }

  if (error) {
    return <div className="state state-error">{error}</div>
  }

  if (!product) {
    return <div className="state">Product not found.</div>
  }

  const imageItems = Array.isArray(product.productImages)
    ? product.productImages.map((image) => ({
        url: buildAssetUrl(image.url),
        alt: image.alt || product.name,
      }))
    : []
  if (imageItems.length === 0 && product.map?.url) {
    imageItems.push({
      url: buildAssetUrl(product.map.url),
      alt: product.map.alt || product.name,
    })
  }
  const heroImage = imageItems[0]
  const priceInfo = getLowestPrice(product.lowestPrice, selectedCurrency)

  return (
    <div className="product-detail">
      <section className="breadcrumb" aria-label="Breadcrumb">
        <span>Home</span>
        <span className="breadcrumb-divider" aria-hidden="true">&gt;</span>
        <Link className="breadcrumb-link" to="/">Search</Link>
        <span className="breadcrumb-divider" aria-hidden="true">&gt;</span>
        <span className="breadcrumb-current">{product.name}</span>
      </section>

      <div className="detail-header">
        <div>
          <h1>{product.name}</h1>
          <p>
            {product.duration} days · {product.primaryCountry || 'Unknown country'}
          </p>
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-media">
          <div className="detail-hero">
            {heroImage ? (
              <img src={heroImage.url} alt={heroImage.alt} />
            ) : (
              <div className="detail-hero-placeholder">No image available</div>
            )}
          </div>
          {imageItems.length > 1 ? (
            <div className="detail-gallery">
              {imageItems.slice(1, 5).map((image) => (
                <img key={image.url} src={image.url} alt={image.alt} />
              ))}
            </div>
          ) : null}

          <div className="detail-description">
            <h2>About the trip</h2>
            <p>
              {product.productUrl
                ? `View the full itinerary on ${product.productUrl}.`
                : 'Explore the highlights and included activities below.'}
            </p>
            {Array.isArray(product.activities) && product.activities.length > 0 ? (
              <ul>
                {product.activities.slice(0, 8).map((activity) => (
                  <li key={activity}>{activity}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <aside className="detail-sidebar">
          <div className="detail-card">
            <div className="detail-rating">
              <span className="rating">
                {formatRating(product.reviewRating)}
                <span>({product.reviewCount ?? 0} reviews)</span>
              </span>
              <span className="detail-code">Trip code: {product.productCode || 'TBD'}</span>
            </div>

            <div className="detail-route">
              <div>
                <span>Start</span>
                <strong>{product.startCity || 'TBD'}</strong>
              </div>
              <div>
                <span>End</span>
                <strong>{product.endCity || 'TBD'}</strong>
              </div>
            </div>

            <div className="detail-stats">
              <div>
                <span>Duration</span>
                <strong>{product.duration} days</strong>
              </div>
              <div>
                <span>Style</span>
                <strong>{getPrimaryValue(product.styles, 'TBD')}</strong>
              </div>
              <div>
                <span>Theme</span>
                <strong>{getPrimaryValue(product.themes, 'TBD')}</strong>
              </div>
              <div>
                <span>Physical rating</span>
                <div className="rating-bars" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span
                      key={index}
                      className={index < (product.physicalRating || 0) ? 'bar filled' : 'bar'}
                    />
                  ))}
                </div>
              </div>
            </div>

            {priceInfo?.price ? (
              <div className="detail-price">
                <span>From</span>
                <strong>
                  {priceInfo.currency} {Math.round(priceInfo.price)}
                </strong>
              </div>
            ) : null}

            <button type="button" className="primary-button">Dates and prices</button>
            <button type="button" className="secondary-button">+ Add to compare</button>
          </div>
        </aside>
      </div>

      <nav className="detail-tabs" aria-label="Trip sections">
        <button type="button" className="detail-tab active">About the trip</button>
        <button type="button" className="detail-tab">Itinerary</button>
        <button type="button" className="detail-tab">Know before you book</button>
        <button type="button" className="detail-tab">Important information</button>
        <button type="button" className="detail-tab">Reviews</button>
      </nav>

      <section className="departures">
        <div className="departures-header">
          <h2>Dates and prices</h2>
          <span>{departures.length} departures</span>
        </div>
        <div className="departures-table">
          <div className="departures-row departures-head">
            <span>Starting</span>
            <span>Ending</span>
            <span>Status</span>
            <span>Price</span>
          </div>
          {departures.map((departure) => {
            const departurePrice = getLowestPrice(departure.lowestPrice, selectedCurrency)
            const availabilityLabel = departure.closedForBooking
              ? 'Fully booked'
              : departure.hasPlacesLeft
                ? 'Available'
                : 'On request'

            return (
              <div key={departure.departureId} className="departures-row">
                <span>{toDateLabel(departure.startDate)}</span>
                <span>{toDateLabel(departure.endDate)}</span>
                <span>{availabilityLabel}</span>
                <span>
                  {departurePrice?.price
                    ? `${departurePrice.currency} ${Math.round(departurePrice.price)}`
                    : 'TBD'}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function App() {
  const [selectedRegion, setSelectedRegion] = useState('Germany')

  const selectedCurrency = useMemo(() => {
    const region = REGION_CONFIG.find((r) => r.label === selectedRegion)
    return region?.currency || 'usd'
  }, [selectedRegion])

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
            <Link to="/">Destinations</Link>
            <Link to="/">Ways to travel</Link>
            <Link to="/">Deals</Link>
            <Link to="/">About</Link>
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
        <Routes>
          <Route path="/" element={<ProductSearchPage selectedCurrency={selectedCurrency} />} />
          <Route path="/product/:productId" element={<ProductDetailPage selectedCurrency={selectedCurrency} />} />
        </Routes>

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
