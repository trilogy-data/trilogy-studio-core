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

## Test Run - 2026-02-03 14:22:52

### Summary

| Provider | Model | Pass Rate | Average Latency (ms) | Total Tests |
|----------|-------|-----------|---------------------|-------------|
| OPENAI | gpt-4o | 70.00% | 9764.85 | 20 |
| ANTHROPIC | claude-sonnet-4-20250514 | 5.00% | 59469.20 | 20 |
| GOOGLE | gemini-2.0-flash | 0.00% | 45.35 | 20 |

### OPENAI - gpt-4o

**Pass Rate:** 70.00%  
**Average Latency:** 9764.85ms  
**Total Tests:** 20

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query | where year >= 1980 and year <= 1989 and state in ['AL', 'AR'... | ❌ Fail | 15685.00 | Validation failed after maximum attempts... |
| test-basic-query | where names.year.count >= 1980 and names.year.count <= 1989 ... | ✅ Pass | 16458.00 |  |
| test-basic-query | where names.year.count >= 1980 and names.year.count <= 1989 ... | ✅ Pass | 5353.00 |  |
| test-basic-query | where names.year.count >= 1980 and names.year.count <= 1989 ... | ✅ Pass | 6040.00 |  |
| test-basic-query | where names.year.count >= 1980 and names.year.count <= 1989 ... | ✅ Pass | 6819.00 |  |
| test-star-wars | 
where (names.year.count between 1970 and 1985) and (names.n... | ✅ Pass | 12713.00 |  |
| test-star-wars | 
where (names.year.count between 1970 and 1985) and (names.n... | ✅ Pass | 5556.00 |  |
| test-star-wars | 
where (names.year.count between 1970 and 1985) and (names.n... | ✅ Pass | 4071.00 |  |
| test-star-wars | 
where (names.year.count between 1970 and 1985) and (names.n... | ✅ Pass | 4192.00 |  |
| test-star-wars | 
where (names.year.count between 1970 and 1990) and (names.n... | ✅ Pass | 4408.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win) as t... | ✅ Pass | 5495.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win ? gam... | ✅ Pass | 7419.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win) as t... | ✅ Pass | 2544.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win) as t... | ✅ Pass | 2879.00 |  |
| test-abstract-question | select
    game_tall.team.color,
    sum(game_tall.win) as t... | ✅ Pass | 4907.00 |  |
| test-home-vs-away | select
    game_tall.team_name,
    sum(win ? is_home)::floa... | ❌ Fail | 18605.00 | Validation failed after maximum attempts... |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? gam... | ❌ Fail | 19077.00 | Validation failed after maximum attempts... |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? gam... | ❌ Fail | 21214.00 | Validation failed after maximum attempts... |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win ? gam... | ❌ Fail | 16591.00 | Validation failed after maximum attempts... |
| test-home-vs-away | select
    game_tall.team_name,
    (sum(game_tall.win * (ga... | ❌ Fail | 15271.00 | Validation failed after maximum attempts... |

### ANTHROPIC - claude-sonnet-4-20250514

**Pass Rate:** 5.00%  
**Average Latency:** 59469.20ms  
**Total Tests:** 20

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query | where names.state in ('TX', 'FL', 'GA', 'NC', 'SC', 'VA', 'T... | ✅ Pass | 12173.00 |  |
| test-basic-query |  | ❌ Fail | 1176189.00 | Anthropic API error: fetch failed... |
| test-basic-query |  | ❌ Fail | 710.00 | Anthropic API error: fetch failed... |
| test-basic-query |  | ❌ Fail | 6.00 | Anthropic API error: fetch failed... |
| test-basic-query |  | ❌ Fail | 7.00 | Anthropic API error: fetch failed... |
| test-star-wars |  | ❌ Fail | 8.00 | Anthropic API error: fetch failed... |
| test-star-wars |  | ❌ Fail | 8.00 | Anthropic API error: fetch failed... |
| test-star-wars |  | ❌ Fail | 30.00 | Anthropic API error: fetch failed... |
| test-star-wars |  | ❌ Fail | 37.00 | Anthropic API error: fetch failed... |
| test-star-wars |  | ❌ Fail | 12.00 | Anthropic API error: fetch failed... |
| test-abstract-question |  | ❌ Fail | 42.00 | Anthropic API error: fetch failed... |
| test-abstract-question |  | ❌ Fail | 8.00 | Anthropic API error: fetch failed... |
| test-abstract-question |  | ❌ Fail | 6.00 | Anthropic API error: fetch failed... |
| test-abstract-question |  | ❌ Fail | 7.00 | Anthropic API error: fetch failed... |
| test-abstract-question |  | ❌ Fail | 32.00 | Anthropic API error: fetch failed... |
| test-home-vs-away |  | ❌ Fail | 21.00 | Anthropic API error: fetch failed... |
| test-home-vs-away |  | ❌ Fail | 10.00 | Anthropic API error: fetch failed... |
| test-home-vs-away |  | ❌ Fail | 52.00 | Anthropic API error: fetch failed... |
| test-home-vs-away |  | ❌ Fail | 10.00 | Anthropic API error: fetch failed... |
| test-home-vs-away |  | ❌ Fail | 16.00 | Anthropic API error: fetch failed... |

### GOOGLE - gemini-2.0-flash

**Pass Rate:** 0.00%  
**Average Latency:** 45.35ms  
**Total Tests:** 20

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query |  | ❌ Fail | 177.00 | exception TypeError: fetch failed sending request... |
| test-basic-query |  | ❌ Fail | 9.00 | exception TypeError: fetch failed sending request... |
| test-basic-query |  | ❌ Fail | 10.00 | exception TypeError: fetch failed sending request... |
| test-basic-query |  | ❌ Fail | 10.00 | exception TypeError: fetch failed sending request... |
| test-basic-query |  | ❌ Fail | 38.00 | exception TypeError: fetch failed sending request... |
| test-star-wars |  | ❌ Fail | 11.00 | exception TypeError: fetch failed sending request... |
| test-star-wars |  | ❌ Fail | 583.00 | exception TypeError: fetch failed sending request... |
| test-star-wars |  | ❌ Fail | 6.00 | exception TypeError: fetch failed sending request... |
| test-star-wars |  | ❌ Fail | 6.00 | exception TypeError: fetch failed sending request... |
| test-star-wars |  | ❌ Fail | 6.00 | exception TypeError: fetch failed sending request... |
| test-abstract-question |  | ❌ Fail | 6.00 | exception TypeError: fetch failed sending request... |
| test-abstract-question |  | ❌ Fail | 7.00 | exception TypeError: fetch failed sending request... |
| test-abstract-question |  | ❌ Fail | 4.00 | exception TypeError: fetch failed sending request... |
| test-abstract-question |  | ❌ Fail | 7.00 | exception TypeError: fetch failed sending request... |
| test-abstract-question |  | ❌ Fail | 4.00 | exception TypeError: fetch failed sending request... |
| test-home-vs-away |  | ❌ Fail | 4.00 | exception TypeError: fetch failed sending request... |
| test-home-vs-away |  | ❌ Fail | 4.00 | exception TypeError: fetch failed sending request... |
| test-home-vs-away |  | ❌ Fail | 6.00 | exception TypeError: fetch failed sending request... |
| test-home-vs-away |  | ❌ Fail | 4.00 | exception TypeError: fetch failed sending request... |
| test-home-vs-away |  | ❌ Fail | 5.00 | exception TypeError: fetch failed sending request... |

---

## Test Run - 2026-02-03 22:42:45

### Summary

| Provider | Model | Pass Rate | Average Latency (ms) | Total Tests |
|----------|-------|-----------|---------------------|-------------|
| OPENAI | gpt-5.2 | 100.00% | 5531.60 | 25 |
| ANTHROPIC | claude-opus-4-2025-0514 | 0.00% | 446.36 | 25 |
| GOOGLE | gemini-2.5-flash | 92.00% | 10338.32 | 25 |

### OPENAI - gpt-5.2

**Pass Rate:** 100.00%  
**Average Latency:** 5531.60ms  
**Total Tests:** 25

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query | 
# Southern USA (Census-style) names in the 1980s: common + ... | ✅ Pass | 7916.00 |  |
| test-basic-query | 
# Southern USA (Census-style) in the 1980s: common vs disti... | ✅ Pass | 5849.00 |  |
| test-basic-query | 
where
  names.year between 1980 and 1989
  and names.state ... | ✅ Pass | 4513.00 |  |
| test-basic-query | 
where
  names.year between 1980 and 1989
  and names.state ... | ✅ Pass | 4649.00 |  |
| test-basic-query | 
where
  names.year between 1980 and 1989
  and names.state ... | ✅ Pass | 3819.00 |  |
| test-star-wars | 
# Star Wars impact on baby names (SSA): baseline vs post-19... | ✅ Pass | 10594.00 |  |
| test-star-wars | 
where names.year between 1960 and 2023
select
  names.name,... | ✅ Pass | 8796.00 |  |
| test-star-wars | 
where names.year between 1960 and 2023
select
  names.name,... | ✅ Pass | 5898.00 |  |
| test-star-wars | 
# Star Wars impact report: baseline vs post-1977 uplift + t... | ✅ Pass | 6387.00 |  |
| test-star-wars | 
where names.year between 1960 and 2023
select
  names.name,... | ✅ Pass | 5512.00 |  |
| test-abstract-question | 
select
  case
    when game_tall.team.color in (
      '#FF... | ✅ Pass | 9017.00 |  |
| test-abstract-question | 
select
  case
    when game_tall.team.color in (
      '#FF... | ✅ Pass | 10390.00 |  |
| test-abstract-question | 
select
  case
    when game_tall.team.color in (
      '#FF... | ✅ Pass | 4899.00 |  |
| test-abstract-question | 
select
  case
    when game_tall.team.color in (
      '#FF... | ✅ Pass | 3363.00 |  |
| test-abstract-question | 
select
  case
    when game_tall.team.color in (
      '#FF... | ✅ Pass | 3070.00 |  |
| test-home-vs-away | 
select
  game_tall.team_alias,
  avg(game_tall.win ? game_t... | ✅ Pass | 8622.00 |  |
| test-home-vs-away | 
select
  game_tall.team_alias,
  avg(game_tall.win ? game_t... | ✅ Pass | 2336.00 |  |
| test-home-vs-away | 
select
  game_tall.team_alias,
  avg(game_tall.win ? game_t... | ✅ Pass | 2458.00 |  |
| test-home-vs-away | 
select
  game_tall.team_alias,
  avg(game_tall.win ? game_t... | ✅ Pass | 2045.00 |  |
| test-home-vs-away | 
select
  game_tall.team_alias,
  avg(game_tall.win ? game_t... | ✅ Pass | 2358.00 |  |
| test-window-over-aggregate | 
select
  game_tall.team_name,
  game_tall.team_conf_name,
 ... | ✅ Pass | 12149.00 |  |
| test-window-over-aggregate | 
select
  game_tall.team_name,
  game_tall.team_conf_name,
 ... | ✅ Pass | 3783.00 |  |
| test-window-over-aggregate | 
select
  game_tall.team_name,
  game_tall.team_conf_name,
 ... | ✅ Pass | 3308.00 |  |
| test-window-over-aggregate | 
select
  game_tall.team_name,
  game_tall.team_conf_name,
 ... | ✅ Pass | 3182.00 |  |
| test-window-over-aggregate | 
select
  game_tall.team_name,
  game_tall.team_conf_name,
 ... | ✅ Pass | 3377.00 |  |

### ANTHROPIC - claude-opus-4-2025-0514

**Pass Rate:** 0.00%  
**Average Latency:** 446.36ms  
**Total Tests:** 25

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query |  | ❌ Fail | 518.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-basic-query |  | ❌ Fail | 507.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-basic-query |  | ❌ Fail | 512.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-basic-query |  | ❌ Fail | 411.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-basic-query |  | ❌ Fail | 396.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-star-wars |  | ❌ Fail | 522.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-star-wars |  | ❌ Fail | 309.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-star-wars |  | ❌ Fail | 402.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-star-wars |  | ❌ Fail | 363.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-star-wars |  | ❌ Fail | 423.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-abstract-question |  | ❌ Fail | 449.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-abstract-question |  | ❌ Fail | 435.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-abstract-question |  | ❌ Fail | 431.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-abstract-question |  | ❌ Fail | 771.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-abstract-question |  | ❌ Fail | 371.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-home-vs-away |  | ❌ Fail | 363.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-home-vs-away |  | ❌ Fail | 447.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-home-vs-away |  | ❌ Fail | 467.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-home-vs-away |  | ❌ Fail | 445.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-home-vs-away |  | ❌ Fail | 574.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-window-over-aggregate |  | ❌ Fail | 407.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-window-over-aggregate |  | ❌ Fail | 420.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-window-over-aggregate |  | ❌ Fail | 401.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-window-over-aggregate |  | ❌ Fail | 316.00 | Anthropic API error: HTTP error 404: Not Found... |
| test-window-over-aggregate |  | ❌ Fail | 499.00 | Anthropic API error: HTTP error 404: Not Found... |

### GOOGLE - gemini-2.5-flash

**Pass Rate:** 92.00%  
**Average Latency:** 10338.32ms  
**Total Tests:** 25

#### Test Results

| Test ID | Query | Status | Latency (ms) | Error |
|---------|-------|--------|-------------|-------|
| test-basic-query | 
WHERE
    names.year BETWEEN 1980 AND 1989
    AND names.st... | ✅ Pass | 17190.00 |  |
| test-basic-query | 
WHERE
    names.year BETWEEN 1980 AND 1989
    AND names.st... | ✅ Pass | 3293.00 |  |
| test-basic-query | 
WHERE
    names.year BETWEEN 1980 AND 1989
    AND names.st... | ✅ Pass | 3179.00 |  |
| test-basic-query | 
WHERE
    names.year BETWEEN 1980 AND 1989
    AND names.st... | ✅ Pass | 2197.00 |  |
| test-basic-query | 
WHERE
    names.year BETWEEN 1980 AND 1989
    AND names.st... | ✅ Pass | 2199.00 |  |
| test-star-wars | where names.name in ('Leia', 'Luke', 'Anakin', 'Rey', 'Kylo'... | ✅ Pass | 13073.00 |  |
| test-star-wars | where names.name in ('Leia', 'Luke', 'Anakin', 'Rey', 'Kylo'... | ✅ Pass | 3566.00 |  |
| test-star-wars | where names.name in ('Leia', 'Luke', 'Anakin', 'Rey', 'Kylo'... | ✅ Pass | 3122.00 |  |
| test-star-wars | where names.name in ('Leia', 'Luke', 'Anakin', 'Rey', 'Kylo'... | ✅ Pass | 2812.00 |  |
| test-star-wars | where names.name in ('Leia', 'Luke', 'Anakin', 'Rey', 'Kylo'... | ✅ Pass | 3988.00 |  |
| test-abstract-question | 
SELECT
    CASE
        WHEN game_tall.team.color IN ('#FF0... | ✅ Pass | 23956.00 |  |
| test-abstract-question | 
SELECT
    CASE
        WHEN game_tall.team.color IN ('#FF0... | ✅ Pass | 3916.00 |  |
| test-abstract-question | 
SELECT
    CASE
        WHEN game_tall.team.color IN ('#FF0... | ✅ Pass | 2313.00 |  |
| test-abstract-question | 
SELECT
    CASE
        WHEN game_tall.team.color IN ('#FF0... | ✅ Pass | 2257.00 |  |
| test-abstract-question | 
SELECT
    CASE
        WHEN game_tall.team.color IN ('#FF0... | ✅ Pass | 2237.00 |  |
| test-home-vs-away | 
SELECT
    game_tall.team_name,
    ABS(
        (sum(game_... | ❌ Fail | 27345.00 | Validation failed after maximum attempts... |
| test-home-vs-away | 
SELECT
    game_tall.team_name,
    sum(game_tall.win ? gam... | ✅ Pass | 12753.00 |  |
| test-home-vs-away | 
SELECT
    game_tall.team_name,
    sum(game_tall.win ? gam... | ✅ Pass | 6493.00 |  |
| test-home-vs-away | 
SELECT
    game_tall.team_name,
    sum(game_tall.win ? gam... | ✅ Pass | 3785.00 |  |
| test-home-vs-away | 
SELECT
    game_tall.team_name,
    sum(game_tall.win ? gam... | ✅ Pass | 3027.00 |  |
| test-window-over-aggregate | SELECT
    game_tall.season,
    game_tall.team_conf_name AS... | ❌ Fail | 47956.00 | Validation failed after maximum attempts... |
| test-window-over-aggregate | SELECT
    game_tall.season,
    game_tall.team_conf_name AS... | ✅ Pass | 32537.00 |  |
| test-window-over-aggregate | SELECT
    game_tall.season,
    game_tall.team_conf_name AS... | ✅ Pass | 9363.00 |  |
| test-window-over-aggregate | SELECT
    game_tall.season,
    game_tall.team_conf_name AS... | ✅ Pass | 19355.00 |  |
| test-window-over-aggregate | SELECT
    game_tall.season,
    game_tall.team_conf_name AS... | ✅ Pass | 6546.00 |  |

---

