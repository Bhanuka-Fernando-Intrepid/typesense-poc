# typesense-poc
POC to evaluate Typesense as an alternative to Algolia for indexing, search, filtering, and sorting.

# docker container run
docker run -d `
  --name typesense-poc `
  -p 8108:8108 `
  -v ${PWD}/typesense-data:/data `
  typesense/typesense:30.2 `
  --data-dir /data `
  --api-key=xyz `
  --enable-cors