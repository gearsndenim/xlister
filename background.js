chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'extractJsonFromChatGPT') {
    console.log('📩 Received extractJsonFromChatGPT trigger');

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url.includes('chatgpt.com')) {
        console.log('❌ Not a ChatGPT tab, skipping');
        return;
      }

      console.log('✅ ChatGPT tab found. Injecting extraction script...');

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log('🚀 Running script in ChatGPT tab');

          function extractValidJson(text) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            const decoded = textarea.value;

            const match = decoded.match(/{[\s\S]*}/);
            if (!match) return null;

            try {
              return JSON.parse(match[0]);
            } catch (e) {
              return null;
            }
          }

          const codeBlocks = document.querySelectorAll('code');
          console.log(`🧱 Found ${codeBlocks.length} <code> blocks`);

          for (let i = codeBlocks.length - 1; i >= 0; i--) {
            const parsed = extractValidJson(codeBlocks[i].textContent);
            if (parsed && parsed.source === 'EBAY_LISTER') {
              console.log('📦 Found valid EBAY_LISTER JSON. Sending...');
              chrome.runtime.sendMessage({ action: "parsedEbayJson", payload: parsed });
              break;
            }
          }
        }
      });
    });
  }

  if (msg.action === 'extractEbayComListing') {
    console.log('📩 Received extractEbayComListing trigger');

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url.includes('ebay.com') || !(tab.url.includes('/lstng') || tab.url.includes('/sl/list'))) {
        console.log('❌ Not an eBay.com listing page, skipping');
        return;
      }

      console.log('✅ eBay.com listing page found. Injecting extraction script...');

      // Since we support both /lstng and /sl/list pages now, we can simplify the extraction
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          console.log('🚀 Running eBay.com listing form extraction script');

          // Load settings
          let settings;
          try {
            const response = await fetch(chrome.runtime.getURL('settings.json'));
            settings = await response.json();
          } catch (error) {
            console.error('Failed to load settings, using defaults');
            settings = { currency: { usdToCadRate: 1.35 } };
          }

          // Function to convert USD to CAD using settings
          function convertUsdToCad(usdPrice) {
            const exchangeRate = settings.currency.usdToCadRate || 1.35;
            return (parseFloat(usdPrice) * exchangeRate).toFixed(2);
          }

          // Extract listing data from eBay.com listing form
          function extractEbayListingFormData() {
            const data = {};
            console.log('🔧 Extracting from eBay listing form...');

            // Extract title from form
            const titleInput = document.querySelector('input[name="title"]');
            if (titleInput) {
              data.title = titleInput.value.trim();
              console.log('📝 Title found:', data.title);
            } else {
              console.log('❌ Title input not found');
            }

            // Extract price from form
            const priceInput = document.querySelector('input[name="price"]');
            if (priceInput && priceInput.value) {
              const usdPrice = priceInput.value.replace(/[^0-9.]/g, '');
              data.priceUSD = usdPrice;
              data.priceCAD = convertUsdToCad(usdPrice);
              console.log('💰 Price found:', data.priceUSD, '→', data.priceCAD);
            } else {
              console.log('❌ Price input not found or empty');
            }

            // Extract SKU/Custom Label
            const skuInput = document.querySelector('input[name="customLabel"]');
            if (skuInput) {
              data.sku = skuInput.value.trim();
              console.log('🏷️ SKU found:', data.sku);
            } else {
              console.log('❌ SKU input not found');
            }

            // Extract description
            const descTextarea = document.querySelector('textarea[name="description"]');
            if (descTextarea) data.description = descTextarea.value.trim();

            // Extract condition description
            const conditionTextarea = document.querySelector('textarea[name="itemConditionDescription"]');
            if (conditionTextarea) data.conditionDescription = conditionTextarea.value.trim();

            // Extract attributes from dropdown buttons
            const attributeButtons = document.querySelectorAll('button[name^="attributes."]');
            console.log('🔍 Found attribute buttons:', attributeButtons.length);
            
            attributeButtons.forEach(button => {
              const attributeName = button.getAttribute('name').replace('attributes.', '').toLowerCase();
              const selectedValue = button.textContent.trim();
              
              console.log(`🏷️ Checking ${attributeName}: "${selectedValue}"`);
              
              // Skip if it's just a placeholder or empty
              if (selectedValue && !selectedValue.includes('Select') && !selectedValue.includes('Choose') && !selectedValue.includes('--')) {
                switch(attributeName) {
                  case 'brand': data.brand = selectedValue; break;
                  case 'size': data.size = selectedValue; break;
                  case 'color': data.color = selectedValue; break;
                  case 'style': data.style = selectedValue; break;
                  case 'fit': data.fit = selectedValue; break;
                  case 'rise': data.rise = selectedValue; break;
                  case 'inseam': data.inseam = selectedValue; break;
                  case 'waist size': data.waistSize = selectedValue; break;
                  case 'fabric wash': data.wash = selectedValue; break;
                  case 'closure': data.closure = selectedValue; break;
                  case 'sleeve length': data.sleeveLength = selectedValue; break;
                  case 'neckline': data.neckline = selectedValue; break;
                  case 'collar style': data.collarStyle = selectedValue; break;
                  case 'fabric type': data.fabricType = selectedValue; break;
                  case 'type': data.type = selectedValue; break;
                  case 'chest size': data.chestSize = selectedValue; break;
                  case 'shirt length': data.shirtLength = selectedValue; break;
                  case 'country/region of manufacture': data.country = selectedValue; break;
                }
                console.log(`✅ Set ${attributeName} = ${selectedValue}`);
              }
            });

            // Extract materials (multi-select)
            const materialButton = document.querySelector('button[name="attributes.Material"]');
            if (materialButton) {
              const materialText = materialButton.textContent.trim();
              if (materialText && !materialText.includes('Select')) {
                // Parse multiple materials if they're comma-separated
                data.material = materialText.split(',').map(m => m.trim()).filter(m => m);
              }
            }

            // Extract condition
            const conditionSelect = document.querySelector('select[name="itemCondition"]') ||
                                   document.querySelector('button[name="itemCondition"]');
            if (conditionSelect) {
              data.condition = conditionSelect.value || conditionSelect.textContent.trim();
            }

            // Try to determine template type from title or category
            data.templateType = determineTemplateType(data.title, data);

            // Add metadata
            data.source = 'EBAY_US_CA_BRIDGE';
            data.originalUrl = window.location.href;
            data.extractedAt = new Date().toISOString();

            return data;
          }

          // Function to determine template type based on title and data
          function determineTemplateType(title, data) {
            if (!title) return 'jeans'; // default
            
            const titleLower = title.toLowerCase();
            
            // Check for specific clothing types in title
            if (titleLower.includes('hoodie') || titleLower.includes('sweatshirt')) {
              return 'hoodies';
            }
            if (titleLower.includes('jacket') || titleLower.includes('blazer') || titleLower.includes('coat')) {
              if (titleLower.includes('women') || titleLower.includes('ladies')) {
                return 'jackets_womens';
              }
              return 'jackets';
            }
            if (titleLower.includes('jean')) {
              if (titleLower.includes('women') || titleLower.includes('ladies')) {
                return 'jeans_womens';
              }
              return 'jeans';
            }
            if (titleLower.includes('pant') || titleLower.includes('trouser')) {
              return 'pants';
            }
            if (titleLower.includes('short')) {
              if (titleLower.includes('swim') || titleLower.includes('board')) {
                return 'shorts_swim';
              }
              if (titleLower.includes('athletic') || titleLower.includes('gym') || titleLower.includes('sport')) {
                return 'shorts_activewear';
              }
              return 'shorts';
            }
            if (titleLower.includes('polo')) {
              return 'shirt_polo';
            }
            if (titleLower.includes('button') || titleLower.includes('dress shirt')) {
              return 'shirt_button';
            }
            if (titleLower.includes('t-shirt') || titleLower.includes('tee') || titleLower.includes('tank')) {
              return 'shirt_tee';
            }
            if (titleLower.includes('athletic') || titleLower.includes('dri-fit') || titleLower.includes('training')) {
              return 'shirt_activewear';
            }
            if (titleLower.includes('sweater') || titleLower.includes('pullover') || titleLower.includes('cardigan')) {
              return 'sweaters';
            }
            if (titleLower.includes('sweatpant') || titleLower.includes('jogger')) {
              return 'sweatpants';
            }
            
            // Default to jeans if unsure
            return 'jeans';
          }

          const extractedData = extractEbayListingFormData();
          console.log('📦 Extracted eBay.com listing form data:', extractedData);
          
          // Send back to popup
          chrome.runtime.sendMessage({ action: "extractedEbayComData", payload: extractedData });
        }
      });
    });
  }

  if (msg.action === 'createListing') {
    console.log('📩 Received createListing trigger');
    
    // Load settings to get template URLs
    fetch(chrome.runtime.getURL('settings.json'))
      .then(response => response.json())
      .then(settings => {
        const listingData = msg.data;
        const templateType = listingData.templateType || 'jeans';
        
        // Get the appropriate eBay.ca template URL
        const templateUrl = settings.templates.ebayCA.categories[templateType] || 
                           settings.templates.ebayCA.defaultTemplate;
        
        console.log('🎯 Using template for', templateType, ':', templateUrl);
        
        // Create new tab with eBay.ca template
        chrome.tabs.create({ url: templateUrl }, (newTab) => {
          // Wait for tab to load, then fill the form
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Inject content script and fill form
              chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                files: ['contentScript.js']
              }, () => {
                // Send the listing data to fill the form
                chrome.tabs.sendMessage(newTab.id, { 
                  action: 'fillForm', 
                  data: listingData 
                });
              });
            }
          });
        });
        
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('❌ Failed to load settings:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Will respond asynchronously
  }
});
