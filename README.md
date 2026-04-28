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

# CMD
docker run -d --name typesense-poc -p 8108:8108 -v %cd%/typesense-data:/data -e TYPESENSE_DATA_DIR=/data -e TYPESENSE_API_KEY=xyz typesense/typesense:30.2

### How to Run

1.  Open your terminal (CMD or PowerShell) in the `typesense-poc/` folder.
2.  Run the following command:
    ```cmd
    docker compose up -d
    ```
3.  **Access the API**: Go to `http://localhost:8108/health`.
4.  **Access the Dashboard**: Go to `http://localhost:8109`. 
