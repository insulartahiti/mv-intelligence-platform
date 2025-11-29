# Portfolio Email Forwarding & File Upload Features

## Overview

This document describes the newly implemented portfolio management features that allow users to forward emails to Google Workspace IDs and upload files for portfolio companies.

## Features Implemented

### 1. Email Forwarding to Google Workspace

**Purpose**: Forward portfolio-related emails to specific Google Workspace IDs for better organization and tracking.

**API Endpoint**: `POST /api/portfolio/forward-email`

**Request Body**:
```json
{
  "companyId": "uuid",
  "googleWorkspaceId": "workspace-123",
  "emailSubject": "Portfolio Update",
  "emailContent": "Email content here...",
  "emailFrom": "sender@example.com",
  "emailTo": "recipient@workspace.com",
  "emailDate": "2025-01-02",
  "attachments": []
}
```

**Response**:
```json
{
  "success": true,
  "emailId": "uuid",
  "message": "Email forwarded successfully"
}
```

**UI Component**: `PortfolioEmailForwarder`
- Located in company detail pages
- Form-based interface for email forwarding
- Real-time validation and feedback

### 2. File Upload for Portfolio Companies

**Purpose**: Upload and manage files related to portfolio companies with proper categorization and metadata.

**API Endpoint**: `POST /api/portfolio/upload-file`

**Request**: Multipart form data
- `file`: The file to upload
- `companyId`: Target company ID
- `fileType`: Type of file (financial_report, presentation, contract, etc.)
- `description`: Optional description

**Supported File Types**:
- Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT
- Images: JPG, PNG, GIF
- Maximum size: 10MB

**Response**:
```json
{
  "success": true,
  "fileId": "uuid",
  "fileName": "document.pdf",
  "fileUrl": "https://storage.url/file",
  "message": "File uploaded successfully"
}
```

**UI Component**: `PortfolioFileUploader`
- Drag-and-drop interface
- File type validation
- Progress feedback
- File categorization

### 3. File and Email Management

**File Management**:
- View uploaded files with metadata
- Download files via public URLs
- Delete files with confirmation
- File type icons and size formatting

**Email Management**:
- View forwarded emails with status
- Track forwarding status (forwarded, pending, failed)
- Email content preview
- Timestamp tracking

## Database Schema

### portfolio_emails Table
```sql
CREATE TABLE portfolio_emails (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  google_workspace_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  from_email TEXT,
  to_email TEXT,
  email_date TIMESTAMPTZ,
  attachments JSONB DEFAULT '[]',
  status TEXT DEFAULT 'forwarded',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### portfolio_files Table
```sql
CREATE TABLE portfolio_files (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Usage Instructions

### For Email Forwarding:

1. Navigate to a company detail page (`/companies/[id]`)
2. Scroll to the "Portfolio Management" section
3. Click "📧 Forward Email" button
4. Fill in the required fields:
   - Google Workspace ID
   - Email Subject
   - Email Content
   - From/To emails (optional)
   - Email Date
5. Click "Forward Email"

### For File Upload:

1. Navigate to a company detail page (`/companies/[id]`)
2. Scroll to the "Portfolio Management" section
3. Click "📁 Upload File" button
4. Select file type and add description (optional)
5. Drag and drop a file or click to browse
6. File will be uploaded automatically

### Viewing Files and Emails:

- Files and emails are displayed in the same section
- Files show with icons, names, sizes, and upload dates
- Emails show with subjects, status, and timestamps
- Both support refresh and delete operations

## Security Features

- File size limits (10MB max)
- File type validation
- Row Level Security (RLS) policies
- Secure file storage in Supabase Storage
- Input validation and sanitization

## Future Enhancements

### Planned Features:
1. **Google Workspace API Integration**: Actual email forwarding via Google Workspace API
2. **Advanced File Processing**: OCR, text extraction, and content analysis
3. **Email Templates**: Pre-defined email templates for common scenarios
4. **Bulk Operations**: Upload multiple files or forward multiple emails
5. **File Versioning**: Track file versions and changes
6. **Advanced Search**: Search across files and emails
7. **Notifications**: Real-time notifications for uploads and forwards

### Technical Improvements:
1. **Error Handling**: More comprehensive error handling and user feedback
2. **Performance**: Optimized file uploads and database queries
3. **UI/UX**: Better styling and user experience
4. **Mobile Support**: Responsive design for mobile devices
5. **Accessibility**: WCAG compliance and keyboard navigation

## API Reference

### GET /api/portfolio/forward-email?companyId={id}
Retrieve forwarded emails for a company.

### GET /api/portfolio/upload-file?companyId={id}
Retrieve uploaded files for a company.

### DELETE /api/portfolio/upload-file
Delete a specific file.
```json
{
  "fileId": "uuid"
}
```

## Troubleshooting

### Common Issues:

1. **File Upload Fails**:
   - Check file size (must be < 10MB)
   - Verify file type is supported
   - Ensure company ID is valid

2. **Email Forwarding Fails**:
   - Verify all required fields are provided
   - Check company ID exists
   - Ensure Google Workspace ID is valid

3. **Files Not Displaying**:
   - Check database connection
   - Verify RLS policies
   - Refresh the page

### Error Codes:

- `400`: Bad Request (missing required fields)
- `404`: Not Found (company doesn't exist)
- `413`: Payload Too Large (file too big)
- `415`: Unsupported Media Type (invalid file type)
- `500`: Internal Server Error (database or storage issue)

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API response errors
3. Check browser console for client-side errors
4. Verify database and storage permissions






