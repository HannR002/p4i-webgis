# Storage boundary

P4I currently stores imported vector features in PostgreSQL/PostGIS and does not call a blob/object
storage API at runtime. A Storage provider contract is intentionally not introduced until an actual
operation (upload, signed URL, delete, or metadata lookup) is required. This prevents a speculative
abstraction while reserving the provider boundary described in the backend architecture document.
