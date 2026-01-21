$(document).ready(function() {
    // r2 bucket url -> bypass vercel proxy for main gallery grid
    const R2_BASE_URL = 'https://bucket.wildwizardcreation.com/';
    
    const $body = $('body');
    const $checkboxItems = $('.checkbox-item');
    const $selectAllButton = $('#selectAllCheckboxes');
    const $overlay = $('#image-overlay');
    const $previewImage1 = $('#preview-image-1');
    const $previewImage2 = $('#preview-image-2');
    const $galleryContainer = $('.gallery-container');
    const $imageCountInfo = $('#image-count-info');
    const $fandomDropdown = $('#fandom-dropdown');
    const $sortDropdown = $('#sort-dropdown');

    const colorThief = new ColorThief();
    
    let allSelected = false;
    let masterGalleryData = [];
    let resizeTimeout;


    function fetchDominantColor(sourceUrl, $targetElement, $secondaryElement) {
        if (!sourceUrl) return;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = sourceUrl + "?cors=yes";

        img.onload = function() {
            try {
                const color = colorThief.getColor(img);
                const rgb = `rgb(${color.join(',')})`;
                
                const applyColor = ($el) => {
                    $el.data('dominant-color', rgb);
                    if ($el.is(':hover')) {
                        $el.parent().css('--image-border', rgb);
                    }
                };

                applyColor($targetElement);

                if ($secondaryElement) {
                    applyColor($secondaryElement);
                }

            } catch (e) {
                console.warn('background color extraction failed', e);
            }
        };
    }

    function getDropdownValue($dropdown) {
        return $dropdown.attr('data-value');
    }

    function setDropdownValue($dropdown, value) {
        $dropdown.attr('data-value', value);
        
        const $menu = $dropdown.find('.drop-menu');
        $menu.find('a').removeClass('selected');
        
        const $target = $menu.find(`a[data-value="${value}"]`);
        if ($target.length) {
            $target.addClass('selected');
            $dropdown.find('.drop-btn').text($target.text());
        }
    }

    function parseDate(dateString) {
        if (!dateString) return new Date(0);
        if (/^\d{4}$/.test(dateString)) {
            return new Date(dateString, 0, 1);
        }
        const parts = dateString.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[0] - 1, parts[1]);
        }
        return new Date(0);
    }

    function getColumnCount() {
        const width = $(window).width();
        if (width >= 1280) return 4;
        if (width >= 1024) return 3;
        if (width >= 768) return 2;
        return 1;
    }

    function getFilteredData() {
        const selectedFandom = getDropdownValue($fandomDropdown) || 'all';
        
        return masterGalleryData.filter(image => {
            const imageFandoms = image.fandom || [];
            const fandomMatch = (selectedFandom === 'all') || imageFandoms.includes(selectedFandom);
            if (!fandomMatch) return false;

            if (image.tags && image.tags.length > 0) {
                for (let tag of image.tags) {
                    const $checkbox = $('#' + tag.trim());
                    if ($checkbox.length && !$checkbox.is(':checked')) {
                        return false;
                    }
                }
            }
            return true;
        });
    }

    function getSortedData(data) {
        const sortOrder = getDropdownValue($sortDropdown) || 'newest';
        const sorted = [...data];

        if (sortOrder === 'newest') {
            sorted.sort((a, b) => b.parsedDate - a.parsedDate);
        } else if (sortOrder === 'oldest') {
            sorted.sort((a, b) => a.parsedDate - b.parsedDate);
        }
        return sorted;
    }

    function renderGallery() {
        const $scrollContainer = $('.gallery-area');
        const previousScrollTop = $scrollContainer.scrollTop();

        const filteredData = getFilteredData();
        const sortedData = getSortedData(filteredData);
        
        $galleryContainer.empty();
        
        const numCols = getColumnCount();
        const columns = [];
        const colHeights = new Array(numCols).fill(0);

        for (let i = 0; i < numCols; i++) {
            const $col = $('<div>').addClass('col');
            columns.push($col);
            $galleryContainer.append($col);
        }

        const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = $(entry.target);
                const src = img.data('src');
                
                if (src) {
                    img.attr('src', src);
                    img.removeAttr('data-src');
                    img.on('load', function() {
                        $(this).addClass('loaded');
                        $(this).parent('.image-div').css('min-height', '0'); 
                    });
                }
                
                obs.unobserve(entry.target);
            }
        });
    }, { rootMargin: "0px 0px 200px 0px" });

        sortedData.forEach((image, index) => {
            const $wrapper = image.$el;
            const $img = $wrapper.find('img.gallery-image');
            const imgDOM = $img[0];
            
            $wrapper.detach(); 

            let minColIndex = 0;
            let minHeight = colHeights[0];

            for(let i = 1; i < numCols; i++) {
                if (colHeights[i] < minHeight) {
                    minHeight = colHeights[i];
                    minColIndex = i;
                }
            }

            const $targetColumn = columns[minColIndex];
            
            let estimatedAspectRatio = 1;
            if (imgDOM.complete && imgDOM.naturalHeight > 0) {
                estimatedAspectRatio = imgDOM.naturalHeight / imgDOM.naturalWidth;
            }

            $targetColumn.append($wrapper);
            colHeights[minColIndex] += estimatedAspectRatio;

            if ($img.attr('data-src')) {
                observer.observe($img[0]);
            }
        });

        $scrollContainer.scrollTop(previousScrollTop);

        updateImageCount(masterGalleryData.length, sortedData.length);
        updateSelectAllState();
    }

    function updateImageCount(total, visible) {
        $imageCountInfo.text(`Showing ${visible} of ${total} images.`);
    }

    function updateSelectAllState() {
        const allChecked = $checkboxItems.length === $checkboxItems.filter(':checked').length;
        allSelected = allChecked;
        $selectAllButton.text(allSelected ? 'Deselect All' : 'Select All');
    }

    function saveState() {
        const filterStates = {};
        $('#checkbox-filters .checkbox-item').each(function() {
            filterStates[this.id] = this.checked;
        });
        localStorage.setItem('galleryFilters', JSON.stringify(filterStates));
        localStorage.setItem('galleryFandom', getDropdownValue($fandomDropdown));
        localStorage.setItem('gallerySort', getDropdownValue($sortDropdown));
    }

    function loadState() {
        const savedFiltersJSON = localStorage.getItem('galleryFilters');
        const savedFandom = localStorage.getItem('galleryFandom');
        const savedSort = localStorage.getItem('gallerySort');

        if (savedFiltersJSON === null) {
            $('[data-tag="rpf"]').prop('checked', true); 
        } else {
            const savedFilters = JSON.parse(savedFiltersJSON);
            Object.keys(savedFilters).forEach(tag => {
                const isChecked = savedFilters[tag];
                $(`.checkbox-item[data-tag="${tag}"]`).prop('checked', isChecked);
            });
        }

        if (savedFandom) { setDropdownValue($fandomDropdown, savedFandom); }
        
        if (savedSort) { 
            setDropdownValue($sortDropdown, savedSort); 
        } else {
            setDropdownValue($sortDropdown, 'newest');
        }
    }

    $('.custom-dropdown').on('click', '.drop-menu a', function(e) {
        e.preventDefault();
        const $link = $(this);
        const $dropdown = $link.closest('.custom-dropdown');
        const $btn = $dropdown.find('.drop-btn');
        const value = $link.attr('data-value');
        
        $dropdown.find('.drop-menu a').removeClass('selected');
        $link.addClass('selected');
        $btn.text($link.text());
        
        $dropdown.attr('data-value', value);
        
        renderGallery();
        saveState();
    });

    $.getJSON("/gallery/gallery.json", function(gallery) {
        masterGalleryData = gallery.map(image => {
            image.parsedDate = parseDate(image.date);
            
            // setup two sets of urls:
            // 1. raw url: loads directly from r2 bucket (saves vercel bandwidth)
            // 2. pretty url: cleaner url for sharing/linking (uses vercel proxy)
            const rawUrl = `${R2_BASE_URL}${image.filename}`;
            const prettyUrl = `/gallery/${image.filename}`;
            
            const imageFandoms = (image.fandom || []).join(',');
            
            // handle preview-2 similarly if it exists
            const preview2Raw = image['preview-2'] ? `${R2_BASE_URL}${image['preview-2']}` : '';
            const preview2Pretty = image['preview-2'] ? `/gallery/${image['preview-2']}` : '';
            
            const $imgElement = $('<img>', {
                'class': 'gallery-image',
                'data-src': rawUrl, // load the raw url
                'data-pretty': prettyUrl, // store pretty url for new tab events
                'rating': image.rating,
                'fandom': imageFandoms,
                'data-preview-2-raw': preview2Raw,
                'data-preview-2-pretty': preview2Pretty
            });

            const $wrapper = $('<div>').addClass('image-div').append($imgElement);
            image.$el = $wrapper;

            return image;
        });

        const fandoms = new Set();
        masterGalleryData.forEach(image => {
            if (image.fandom && image.fandom.length > 0) {
                image.fandom.forEach(f => fandoms.add(f));
            }
        });
        const sortedFandoms = Array.from(fandoms).sort((a, b) => a.localeCompare(b));
        
        const $fandomMenu = $fandomDropdown.find('.drop-menu');
        sortedFandoms.forEach(fandom => {
            $fandomMenu.append(
                $('<a>').attr('data-value', fandom).text(fandom)
            );
        });

        loadState();
        renderGallery();
    });

    $checkboxItems.on('change', function() {
        const $changed = $(this);
        const tag = $changed.attr('data-tag');
        const isChecked = $changed.is(':checked');

        if (tag) {
            $(`.checkbox-item[data-tag="${tag}"]`).prop('checked', isChecked);
        }

        renderGallery();
        saveState();
    });

    $selectAllButton.on('click', function() {
        allSelected = !allSelected;
        $checkboxItems.prop('checked', allSelected);
        renderGallery();
        saveState();
    });

    $(window).on('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(renderGallery, 200);
    });

    $galleryContainer.on('click', '.gallery-image', function() {
        const $clickedImage = $(this);
        
        // get the currently loaded src (raw R2 url)
        const preview1_src = $clickedImage.attr('src');
        // get the stored pretty url
        const preview1_pretty = $clickedImage.data('pretty');
        
        // get both versions for the second image
        const preview2_src = $clickedImage.data('preview-2-raw');
        const preview2_pretty = $clickedImage.data('preview-2-pretty');

        if (!preview1_src) return;

        const $preview2Wrapper = $previewImage2.parent();
        const loadPromises = [];

        $previewImage1.removeAttr('style').attr('src', '');
        $previewImage2.removeAttr('style').attr('src', '');
        $previewImage1.removeData('dominant-color');
        $previewImage2.removeData('dominant-color');
        $previewImage1.parent().css('--image-border', 'var(--background)');
        $previewImage2.parent().css('--image-border', 'var(--background)');

        $preview2Wrapper.hide();

        // load first image
        const load1 = new Promise(resolve => {
            $previewImage1
                .one('load error', resolve) 
                .removeAttr('crossorigin') // FAST LOAD: use cache, no cors
                .attr('src', preview1_src)
                .data('pretty-link', preview1_pretty); 
            
            if ($previewImage1.prop('complete')) $previewImage1.trigger('load');

            // uses first image color for both previews if second exists
            const $secondaryTarget = preview2_src ? $previewImage2 : null;
            fetchDominantColor(preview1_src, $previewImage1, $secondaryTarget);
        });
        loadPromises.push(load1);

        // load second image if it exists
        if (preview2_src) {
            $preview2Wrapper.show();
            const load2 = new Promise(resolve => {
                $previewImage2
                    .one('load error', resolve)
                    .removeAttr('crossorigin')
                    .attr('src', preview2_src)
                    .data('pretty-link', preview2_pretty);
                
                if ($previewImage2.prop('complete')) $previewImage2.trigger('load');

            });
            loadPromises.push(load2);
        }
        
        Promise.all(loadPromises).then(() => {
            $overlay.removeClass('hidden').hide().fadeIn(300);
        });
    });

    $overlay.on('click', function(e) {
        if (e.target.id === 'image-overlay' || e.target.id === 'close-overlay') {
            $(this).fadeOut(300, function() {
                $(this).addClass('hidden');
                $previewImage1.attr('src', '');
                $previewImage2.attr('src', '');
            });
        }
    });
    
    // updated handler: opens the pretty link instead of the raw src
    $('.preview-image').on('click', function(e) {
        e.stopPropagation();
        const prettyLink = $(this).data('pretty-link');
        
        // fallback to src if pretty link is missing for some reason
        const urlToOpen = prettyLink || $(this).attr('src');
        window.open(urlToOpen, '_blank');
    });

    $('.preview-image').on('mouseenter', function() {
        const color = $(this).data('dominant-color');
        if (color) {
            $(this).parent().css('--image-border', color);
        } else {
            $(this).parent().css('--image-border', 'var(--background)');
        }
    });
});