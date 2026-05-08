# MovieLens ml-latest-small fixture

The CSVs in this directory are the **MovieLens "latest-small"** dataset
(~100k ratings, ~10k movies). Used as a real-world fixture for the DuckDB
worker's `read_csv` regression tests — synthetic CSVs miss enough
real-data quirks (commas in titles, multi-genre `|` lists, large id
ranges) that committing a copy is worth the ~3MB.

Source: <https://files.grouplens.org/datasets/movielens/ml-latest-small.zip>
(GroupLens Research, University of Minnesota). See the upstream
`README.txt` for citation requirements and usage terms — please cite the
GroupLens paper for any published work that derives from this data.
