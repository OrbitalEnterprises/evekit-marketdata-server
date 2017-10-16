# EveKit Market Data Services

The EveKit Market Data server provides REST access to current and historical order book data and market summaries for EVE Online regions \(i.e. not player owned structures - yet\).  Data for the previous 1-2 days is stored on the service itself.  Older history is stored and Google Cloud Storage.  The service endpoints provide access to both data transparently.  More details about the service can be found [here](https://evekit.orbital.enterprises//#/md/main).

## REST Endpoints

## Bulk Data

## Proposed Extensions

### Fetch order book data for X item types for Y regions for Z days in bulk (REQUESTED)

Assumptions:

1. Less than 100 market types;
2. Less than 10 regions;
3. Less than 30 days;
4. Retrieve entire day of data per type/region.

Required SLA:

1. Retrieve data in 5 seconds or less per requested day?

Historic data \(data older than the last 1-2 days\) is organized by day.  Therefore, without re-generating files, each day will need to be requested separately.  Non-historic data is stored as regional snapshots, but *not* sorted by type \(unlike history data, which *is* sorted by type to support efficient range queries\).  We'll likely need to incrementall generate cache files in order to meet SLA.

Historic data is relatively easy to obtain, but will require one request per market type per day and region filtering must be done on the receiving end.

