# LinkedIn Connections Export Instructions

To export your LinkedIn connections data:

## Method 1: LinkedIn Data Export (Recommended)

1. Go to LinkedIn.com and sign in
2. Click on "Me" (your profile picture) in the top right
3. Select "Settings & Privacy"
4. Click on "Data Privacy" in the left sidebar
5. Under "How LinkedIn uses your data", click "Get a copy of your data"
6. Select "Connections" from the list
7. Click "Request archive"
8. LinkedIn will email you when the data is ready (usually within 24 hours)
9. Download the ZIP file and extract it
10. Look for a file named `Connections.csv` in the extracted folder
11. Copy this file to your project root as `Connections.csv`

## Method 2: Manual CSV Creation

If you prefer to create the CSV manually, use this format:

```csv
First Name,Last Name,Company,Position,Connected On,Email Address,Phone Number,Profile URL,Website,Location,Notes
John,Smith,Goldman Sachs,Investment Banking Analyst,2024-01-15,john.smith@example.com,+1-555-0123,https://linkedin.com/in/johnsmith,https://johnsmith.com,New York,Former colleague from college
Sarah,Johnson,TechCorp,CTO,2024-02-20,sarah.j@techcorp.com,+1-555-0456,https://linkedin.com/in/sarahjohnson,https://techcorp.com,San Francisco,Met at fintech conference
```

## Required Columns

- **First Name**: Person's first name
- **Last Name**: Person's last name  
- **Company**: Current company (optional)
- **Position**: Current position/title (optional)
- **Connected On**: Date connected (YYYY-MM-DD format)
- **Email Address**: Email address (optional)
- **Phone Number**: Phone number (optional)
- **Profile URL**: LinkedIn profile URL (optional but recommended)
- **Website**: Personal or company website (optional)
- **Location**: City, State/Country (optional)
- **Notes**: Any notes about the connection (optional)

## Notes

- Empty fields are fine - the parser will handle missing data
- The more complete the data, the better the matching and enrichment will be
- Profile URLs help with deduplication and future enrichment
- Company and position information helps with fuzzy matching against existing entities
