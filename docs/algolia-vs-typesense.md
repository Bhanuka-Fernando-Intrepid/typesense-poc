# Algolia vs Typesense Comparison

## Key Differences
- **Self-hosted vs Cloud**: Typesense can be self-hosted or cloud, Algolia is cloud-only
- **Pricing**: Typesense has generous free tier, Algolia charges per record/search
- **Faceting**: Both support faceting, but Typesense requires schema configuration
- **Filtering**: Both support complex filters, Typesense uses filter_by syntax
- **Geo-search**: Both support, Typesense has built-in geo fields
- **Analytics**: Algolia has built-in analytics, Typesense requires external tools

## Migration Notes
- Schema needs facet fields explicitly enabled in Typesense
- Filter syntax differs (Algolia uses filters, Typesense uses filter_by)
- Typesense supports nested objects better with enable_nested_fields
- API keys are similar, but Typesense has more granular permissions

## Performance
- Both are fast for search
- Typesense may be more cost-effective for high-volume self-hosted use cases
- Algolia has better out-of-box analytics and A/B testing