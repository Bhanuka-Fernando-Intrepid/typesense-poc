const SEARCH_FIELDS = 'name,primaryCountry,destinations,locations,marketingRegions,themes,styles'

export function getFacetOptions(facetCounts, fieldName) {
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

export function buildFilterBy(selectedFilters, selectedCurrency) {
  const clauses = []

  const escapeBackticks = (s) => String(s).replace(/`/g, "\\`")

  if (Array.isArray(selectedFilters.marketingRegions) && selectedFilters.marketingRegions.length > 0) {
    const vals = selectedFilters.marketingRegions.map((v) => `\`${escapeBackticks(v)}\``).join(',')
    clauses.push(`marketingRegions:=[${vals}]`)
  }

  if (Array.isArray(selectedFilters.styles) && selectedFilters.styles.length > 0) {
    selectedFilters.styles.forEach((value) => {
      clauses.push(`styles:=[\`${escapeBackticks(value)}\`]`)
    })
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

  // Handle start/end as a single range and support both seconds and milliseconds storage
  if (selectedFilters.startDate || selectedFilters.endDate) {
    let startSec = null
    let endSec = null
    if (selectedFilters.startDate) {
      const m = selectedFilters.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (m) {
        const y = Number(m[1])
        const mo = Number(m[2]) - 1
        const d = Number(m[3])
        const ts = Math.floor(Date.UTC(y, mo, d, 0, 0, 0) / 1000)
        if (!Number.isNaN(ts)) startSec = ts
      }
    }
    if (selectedFilters.endDate) {
      const m2 = selectedFilters.endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (m2) {
        const y2 = Number(m2[1])
        const mo2 = Number(m2[2]) - 1
        const d2 = Number(m2[3])
        const tsEnd = Math.floor(Date.UTC(y2, mo2, d2, 23, 59, 59) / 1000)
        if (!Number.isNaN(tsEnd)) endSec = tsEnd
      }
    }

    // Build two range clauses: one using seconds (as stored), one using milliseconds (if index stores ms)
    const secParts = []
    const msParts = []
    if (startSec !== null) {
      secParts.push(`startDate:>=${startSec}`)
      msParts.push(`startDate:>=${startSec * 1000}`)
    }
    if (endSec !== null) {
      secParts.push(`startDate:<=${endSec}`)
      msParts.push(`startDate:<=${endSec * 1000}`)
    }

    if (secParts.length > 0) {
      const secClause = secParts.join(' && ')
      const msClause = msParts.join(' && ')
      if (msClause) {
        clauses.push(`(${secClause} || ${msClause})`)
      } else {
        clauses.push(secClause)
      }
    }
  }

  if (selectedFilters.onSale) clauses.push(`lowestPrice.${selectedCurrency}.onSale:=true`)
  if (selectedFilters.newTrips) clauses.push(`isNew:=true`)

  return clauses.join(' && ')
}

export function buildSearchQuery(query, sortBy, filters, selectedCurrency) {
  const searchQuery = query.trim() ? query.trim() : '*'
  const filterBy = buildFilterBy(filters, selectedCurrency)

  // Compute typo tolerance (num_typos) based on query length.
  // 0 for very short queries, 1 for medium, 2 for longer queries.
  const qlen = searchQuery === '*' ? 0 : searchQuery.length
  let numTypos = 0
  if (qlen >= 5) numTypos = 2
  else if (qlen >= 3) numTypos = 1

  const searchParameters = {
    q: searchQuery,
    query_by: SEARCH_FIELDS,
    max_facet_values: 50,
    per_page: 250,
    sort_by: sortBy,
    num_typos: numTypos,
  }

  if (filterBy) {
    searchParameters.filter_by = filterBy
  }

  return searchParameters
}