# eBay US → CA Bridge Extension

A Chrome browser extension that automates the process of copying eBay listings from eBay.com to eBay.ca, handling currency conversion, category mapping, and form field population.

## 🚀 What This Extension Does

This extension bridges the gap between eBay US and eBay Canada by:

1. **Extracting listing data** from eBay.com listing pages
2. **Converting USD to CAD** with configurable exchange rates
3. **Automatically filling forms** on eBay.ca with the extracted data
4. **Handling category mapping** between different eBay regions
5. **Processing images** by downloading and resizing them for optimal quality
6. **Validating form data** to ensure accuracy before publishing

## 📋 Key Features

### 🔄 Cross-Platform Listing Transfer
- Extract complete listing data from eBay.com (title, price, description, images, attributes)
- Automatically convert USD prices to CAD using configurable exchange rates
- Transfer all product attributes (brand, size, color, material, etc.)
- Handle complex multi-select fields (themes, features, materials)

### 🎯 Smart Category Navigation
- Automatically detect product categories from source listings
- Navigate eBay.ca category hierarchy intelligently
- Handle gender-specific categories (Men's vs Women's items)
- Prevent category mismatches with built-in validation

### 🖼️ Image Processing
- Download images from eBay.com listings
- Resize images to optimal quality (500px+ width minimum)
- Skip thumbnails from expired listings
- Support multiple image formats and sources

### ✅ Form Validation & Auto-Fix
- Real-time verification of populated form fields
- Automatic correction of common field mapping issues
- Visual highlighting of mismatched or missing data
- Brand field protection to prevent incorrect values

### ⌨️ Keyboard Shortcuts
- **Cmd/Ctrl + Period**: Context-aware quick actions
  - On eBay.com listings: Extract data and bridge to eBay.ca
  - On eBay.com items: Navigate to edit mode
  - On eBay.ca listings: Fill form with saved data
  - On ChatGPT: Extract JSON from conversation

## 🛠️ How It Works

### 1. Data Extraction Phase
The extension analyzes eBay.com listing pages to extract:
- Basic information (title, price, SKU, description)
- Product attributes (brand, size, color, materials, etc.)
- Category information and hierarchy
- Images and their URLs
- Condition and condition descriptions

### 2. Data Processing Phase
- Converts USD prices to CAD using settings-defined exchange rate
- Maps product categories between eBay regions
- Processes images for optimal quality
- Validates and cleans extracted data

### 3. Form Population Phase
- Opens eBay.ca listing page with appropriate template
- Dynamically populates all form fields
- Handles dropdown selections and multi-select fields
- Uploads and processes images
- Sets appropriate category and subcategory

### 4. Validation Phase
- Compares original data with populated form
- Highlights any mismatches or missing fields
- Attempts automatic correction of common issues
- Provides visual feedback for manual review

## 📁 File Structure

```
xlister/
├── manifest.json          # Extension metadata and permissions
├── background.js          # Background service worker for API calls
├── contentScript.js       # Main logic for page interaction (4000+ lines)
├── popup.html            # Extension popup interface
├── popup.js              # Popup interaction logic
├── settings.json         # Configuration and settings
├── icon.png              # Extension icon
├── AI_INPUT.TXT          # AI instructions for JSON generation
├── TITLE_STRUCTURE.txt   # Title formatting guidelines
└── README.md            # This documentation
```

## ⚙️ Configuration

### Currency Settings (`settings.json`)
```json
{
  "currency": {
    "usdToCadRate": 1.38,
    "lastUpdated": "2025-08-23"
  }
}
```

### Template Configuration
```json
{
  "templates": {
    "ebayCA": {
      "defaultTemplateId": "6650616013",
      "defaultTemplate": "https://www.ebay.ca/lstng?mode=AddItem&templateId=6650616013"
    }
  }
}
```

## 🎮 Usage Instructions

### Method 1: Extension Popup
1. Navigate to any eBay.com listing page
2. Click the extension icon in your browser toolbar
3. Click "Extract Data" to analyze the listing
4. Review the extracted data in the popup
5. Click "Create on eBay.ca" to open and populate the Canadian listing

### Method 2: Keyboard Shortcuts
1. Navigate to any eBay.com listing page
2. Press **Cmd/Ctrl + Period**
3. The extension will automatically extract data and open eBay.ca
4. Form fields will be populated automatically

### Method 3: Item Page Navigation
1. Go to any eBay.com item page (`/itm/` URL)
2. Use the extension popup or keyboard shortcut
3. Automatically navigate to edit mode
4. Extract and bridge to eBay.ca

## 🔧 Advanced Features

### Dynamic Field Detection
The extension dynamically detects and maps ALL attribute fields present on eBay listing pages, including:
- Standard attributes (brand, size, color)
- Category-specific fields (inseam for jeans, neckline for shirts)
- Multi-select fields (materials, themes, features)
- Regional variations and special cases

### Intelligent Category Mapping
- Analyzes category hierarchy and breadcrumbs
- Handles gender-specific categories (Men's vs Women's)
- Prevents subcategory mismatches (tops vs shorts)
- Supports store categories and time-based selections

### Brand Protection System
- Prevents theme values from being assigned to brand fields
- Verifies brand field accuracy after population
- Automatic correction of brand field issues
- Cross-field validation to prevent conflicts

### Image Quality Management
- Converts eBay thumbnail URLs to full-size versions
- Resizes images to meet eBay's quality standards
- Skips broken or expired listing images
- Optimizes file sizes for faster uploads

## 🚨 Error Handling

The extension includes comprehensive error handling for:
- Network timeouts and connection issues
- Invalid or expired image URLs
- Category mapping failures
- Form validation errors
- Browser permission issues

Visual feedback is provided through:
- Loading overlays during processing
- Error messages for failed operations
- Highlighted fields for manual review
- Progress indicators for multi-step operations

## 🔐 Security & Permissions

Required permissions:
- `scripting`: For injecting content scripts into web pages
- `tabs`: For creating new tabs and managing navigation
- `storage`: For saving extracted data between operations
- `activeTab`: For accessing current page content
- Host permissions for eBay domains and image sources

## 🛟 Troubleshooting

### Common Issues:
1. **Category not selected**: Manually select the appropriate category
2. **Images not uploading**: Check network connection and image URLs
3. **Fields not populated**: Refresh the page and try again
4. **Brand field incorrect**: Use the auto-fix feature or correct manually

### Debug Information:
The extension provides detailed console logging for troubleshooting. Press F12 and check the Console tab for diagnostic information.

## 📈 Version History

- **v2.0**: Dynamic category navigation, enhanced image processing
- **v2.1**: Improved category extraction with intelligent filtering
- Current: Enhanced validation, auto-fix capabilities, keyboard shortcuts

## 👥 Support

For issues, questions, or feature requests related to this eBay listing bridge extension, please check the browser console for error messages and ensure all required permissions are granted.
