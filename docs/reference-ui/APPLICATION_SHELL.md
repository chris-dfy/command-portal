# Application Shell

The shell has four durable regions:

1. Sticky status rail: configurable brand, read-only state, connection, source-of-truth, truth flags, refresh.
2. Optional mode banner: fixture and stale states are prominent and cannot be dismissed.
3. Left navigation: Overview, Verification, Evidence, Architecture, Specialists, System.
4. Main workspace and compact global boundary footer.

Desktop uses a 268px sidebar and a fluid content column. The page header identifies the current operational area; cards below it show curated information rather than a raw JSON dashboard. Evidence detail uses a modal with validated JSON for auditability.

The shell contains no action, approval, upload, or command affordance. Refresh is the only runtime-related browser control and performs GET reads only.
