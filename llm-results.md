# LLM Benchmark Results

This file contains benchmark test results for various LLM providers.

## Test Run - 2025-07-28 16:30:37

### Summary

| Provider | Model | Pass Rate | Average Latency (ms) | Total Tests |
|----------|-------|-----------|---------------------|-------------|
| OPENAI | gpt-4.1-nano | 65.00% | 7686.65 | 20 |
| ANTHROPIC | claude-3-7-sonnet-20250219 | 95.00% | 17358.35 | 20 |
| GOOGLE | gemini-2.0-flash | 90.00% | 4456.00 | 20 |

### OPENAI - gpt-4.1-nano

**Pass Rate:** 65.00%  
**Average Latency:** 7686.65ms  
**Total Tests:** 20

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query |  | ✅ Pass | 4160.00 |  |
| test-basic-query |  | ❌ Fail | 17053.00 |  |
| test-basic-query |  | ✅ Pass | 11117.00 |  |
| test-basic-query |  | ✅ Pass | 10566.00 |  |
| test-basic-query |  | ❌ Fail | 11481.00 |  |
| test-star-wars |  | ✅ Pass | 3223.00 |  |
| test-star-wars |  | ❌ Fail | 7581.00 |  |
| test-star-wars |  | ✅ Pass | 1611.00 |  |
| test-star-wars |  | ✅ Pass | 3643.00 |  |
| test-star-wars |  | ❌ Fail | 7962.00 |  |
| test-abstract-question |  | ❌ Fail | 9457.00 |  |
| test-abstract-question |  | ✅ Pass | 4687.00 |  |
| test-abstract-question |  | ✅ Pass | 8077.00 |  |
| test-abstract-question |  | ✅ Pass | 7306.00 |  |
| test-abstract-question |  | ✅ Pass | 7208.00 |  |
| test-home-vs-away |  | ❌ Fail | 9373.00 |  |
| test-home-vs-away |  | ✅ Pass | 8350.00 |  |
| test-home-vs-away |  | ✅ Pass | 7733.00 |  |
| test-home-vs-away |  | ❌ Fail | 7554.00 |  |
| test-home-vs-away |  | ✅ Pass | 5591.00 |  |

### ANTHROPIC - claude-3-7-sonnet-20250219

**Pass Rate:** 95.00%  
**Average Latency:** 17358.35ms  
**Total Tests:** 20

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query |  | ✅ Pass | 6910.00 |  |
| test-basic-query |  | ✅ Pass | 11957.00 |  |
| test-basic-query |  | ✅ Pass | 6893.00 |  |
| test-basic-query |  | ✅ Pass | 19014.00 |  |
| test-basic-query |  | ❌ Fail | 15639.00 |  |
| test-star-wars |  | ✅ Pass | 10321.00 |  |
| test-star-wars |  | ✅ Pass | 5326.00 |  |
| test-star-wars |  | ✅ Pass | 13196.00 |  |
| test-star-wars |  | ✅ Pass | 11349.00 |  |
| test-star-wars |  | ✅ Pass | 5677.00 |  |
| test-abstract-question |  | ✅ Pass | 7102.00 |  |
| test-abstract-question |  | ✅ Pass | 5714.00 |  |
| test-abstract-question |  | ✅ Pass | 10816.00 |  |
| test-abstract-question |  | ✅ Pass | 6183.00 |  |
| test-abstract-question |  | ✅ Pass | 22280.00 |  |
| test-home-vs-away |  | ✅ Pass | 57112.00 |  |
| test-home-vs-away |  | ✅ Pass | 34768.00 |  |
| test-home-vs-away |  | ✅ Pass | 31433.00 |  |
| test-home-vs-away |  | ✅ Pass | 33417.00 |  |
| test-home-vs-away |  | ✅ Pass | 32060.00 |  |

### GOOGLE - gemini-2.0-flash

**Pass Rate:** 90.00%  
**Average Latency:** 4456.00ms  
**Total Tests:** 20

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query | 
where names.state in ('AL', 'AR', 'FL', 'GA', 'KY', 'LA', '... | ✅ Pass | 2134.00 |  |
| test-basic-query | where
  names.year between 1980 and 1989
  and names.state i... | ✅ Pass | 2008.00 |  |
| test-basic-query | where names.year between 1980 and 1989
 and names.state in (... | ✅ Pass | 2101.00 |  |
| test-basic-query | where names.year between 1980 and 1989
 and names.state in (... | ✅ Pass | 2157.00 |  |
| test-basic-query | where names.year between 1980 and 1989
 and names.state in (... | ✅ Pass | 1582.00 |  |
| test-star-wars | where names.year > 1976
select
    names.year,
    sum(names... | ✅ Pass | 1808.00 |  |
| test-star-wars | 
where names.name in ('Luke', 'Leia', 'Anakin')
select
    n... | ✅ Pass | 1458.00 |  |
| test-star-wars | where names.name like '%luke%' or names.name like '%leia%' o... | ✅ Pass | 1709.00 |  |
| test-star-wars | where names.year between 1977 and 1983 or names.year between... | ✅ Pass | 1746.00 |  |
| test-star-wars | where names.name in ('Luke', 'Leia', 'Han', 'Anakin', 'Rey',... | ✅ Pass | 1714.00 |  |
| test-abstract-question | select
    game_tall.team.color in ('#FF0000', '#800000', '#... | ✅ Pass | 1807.00 |  |
| test-abstract-question | select
    avg(game_tall.win ? game_tall.team.color = '#FF00... | ✅ Pass | 2041.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win) by g... | ✅ Pass | 1655.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win) by g... | ✅ Pass | 1920.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    avg(game_tall.win) as w... | ✅ Pass | 1547.00 |  |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? gam... | ✅ Pass | 34965.00 |  |
| test-home-vs-away | select
    game_tall.team_name,
    sum(game_tall.win ? game... | ❌ Fail | 8488.00 | Validation failed after maximum attempts... |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? gam... | ✅ Pass | 7533.00 |  |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? gam... | ✅ Pass | 4186.00 |  |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? 1 *... | ❌ Fail | 6561.00 | Validation failed after maximum attempts... |

---

