def safe_percentage(part, total):
    """Calculate percentage safely, avoiding divide by zero errors"""
    if total == 0 or total < 0.0001:  # Avoid very small numbers too
        return 0.0
    return (part / total) * 100
