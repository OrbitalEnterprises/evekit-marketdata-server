# EveKit Market Data Services

The EveKit Market Data server provides REST access to current and historical order book data and market summaries for EVE Online regions \(i.e. not player owned structures - yet\).  Data for the previous 1-2 days is stored on the service itself.  Older history is stored and Google Cloud Storage.  The service endpoints provide access to both data transparently.  More details about the service can be found [here](https://evekit.orbital.enterprises//#/md/main).

Market data is provided via two mechanisms:

* **REST ([Open API](https://swagger.io))** - some data may be accessed live from the EveKit market data service.
* **BULK via Google Cloud Storage** - all data is currently archived in bulk form at the Google Cloud Storage URL: gs://evekit_md/YYYY/MM/DD

The following data services are provided:

* **Regional Historic Order Books** *(BULK)* - historic order books are provided for all EVE regions going back to 2016-05-31.  Order books are represented as five minute snapshots starting at midnight UTC.  Bulk files are produced daily.
* **Regional Market History** *(BULK)* - historic market history is provided for all EVE regions going back to 2015-04-01.  Market histories are provided by EVE as daily summaries.  We bulk these summaries across all types and regions and product a daily bulk file.
* **Live Regional Order Books** *(REST)* - any five minute snapshot for any region may be retrieved live from the EveKit market data service.  For a given requested time, the latest snapshot not exceeding the target time is returned.  For convenience, a version of this API exists which always retrieves the latest snapshot for a given type.
* **Live Market History** *(REST)* - any market history summary for any region may be retrieved live from the EveKit market data service.  Note that there is typically a one day delay in producing market history due to when EVE provides the data from its servers.
* `Coming Soon!` **Regional Historic Inferred Trades** *(BULK)* - an estimate of trade activity for each region is computed daily and stored in a bulk data file.  Some trades can be inferred directly by observing changes in order quantity.  Other trades must be guessed at based on volume.  Trade type (e.g. directly inferred versus estimated) is clearly marked in the data files.
* `Coming Soon!` **Citadel Historic Order Books** *(BULK)* - historic order books are provided for the highest daily volume citadels which allow public access to data.  Format is identical to regional order books, with five minute snapshots starting at midnight UTC.
* `Coming Soon!` **Live Citadel Order Books** *(REST)* - any five minute snapshot for any citadel we currently collect for bulk data may be retrieved live from the EveKit market data service.  This service is identical to the regional live service, including a convencience API which always retrieves the latest snapshot.
* `Coming Soon!` **Citadel Historic Inferred Trades** *(BULK)* - same as regional inferred trades except applied to citadels we currently collect data from.  Note that for citadels, trade location is even more difficult to infer since some trades will be matched regionally.  We can repair some missing data by combining regional and citadel data.  This data set does not currently include those repairs.
* `Coming Soon!` **Regional Historic Order Book Summaries** *(BULK)* - historic daily summaries are provided which are computed from our historic order book snapshots including: min, max, mean, median bid/ask price; opening and closing bid/ask price; first and last regional trade (inferred); and, an estimate of mean and median limit versus market orders.
* `Coming Soon!` **Live Regional Order Book Summaries** *(REST)* - the same data provided by the bulk endpoint is also available from a live endpoint for individual dates and regions.
* `Coming Soon!` **Citadel Historic Order Book Summaries** *(BULK)* - historical citadel summaries are provided which match the summaries provided for regional order book data.
* `Coming Soon!` **Live Citadel Order Book Summaries** *(REST)* - the same data provided by the bulk endpoint is also available from a live endpoint for individual dates and citadels.

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

2. An alternative is to provide a "download construction service" which assembles the requested data into a downloadable file which can then be downloaded in bulk by the caller.

