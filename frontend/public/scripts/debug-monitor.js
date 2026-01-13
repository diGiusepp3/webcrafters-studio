// Site Debug Monitor - Inject this script into your website
(function () {
    "use strict";

    // Configuration
    const CONFIG = {
        VERSION: "0.1.9.1",
        PARENT_ORIGIN: "*", // Change this to your parent site origin for security
        Z_INDEX: 10000,
    };

    // State management
    const state = {
        isActive: false,
        interactionMode: "select", // 'select' | 'preview'
        selectedElement: null, // Single element selection (primary clicked element)
        selectedGroup: [], // Group of elements with same x-id (for dynamic content)
        hoverGroup: [], // Group of elements being hovered (for dynamic multi-element preview)
        hoverBadge: null, // Current hover badge element
        selectedBadge: null, // Current selected badge element
        selectedBadges: [], // Array of badges for multi-element selection
        hoverTarget: null, // Target element for hover badge (for repositioning)
        repositionRAF: null, // RequestAnimationFrame ID for badge repositioning
    };

    // Badge Manager - handles dynamic badge positioning with viewport collision detection
    class BadgeManager {
        constructor() {
            this.GAP = 8; // Consistent gap between element and badge
            this.VIEWPORT_PADDING = 8; // Minimum distance from viewport edges
            this.removalTimeouts = new Map(); // Track pending badge removals for cleanup
        }

        /**
         * Creates a new badge element with the given label and type
         * @param {string} label - The text to display in the badge
         * @param {string} type - Badge type: 'hover', 'dynamic', or 'selected'
         * @returns {HTMLElement} The created badge element
         */
        createBadge(label, type = "hover") {
            const badge = document.createElement("div");
            badge.className = `debug-badge ${type}`;
            badge.textContent = label;
            badge.style.opacity = "0";

            // Add accessibility attributes
            badge.setAttribute("role", "tooltip");
            badge.setAttribute("aria-live", "polite");
            badge.id = `debug-badge-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

            document.body.appendChild(badge);
            return badge;
        }

        /**
         * Calculates the best position for a badge relative to its target element
         * Uses fallback positioning strategy: top Ã¢â€ â€™ bottom Ã¢â€ â€™ right Ã¢â€ â€™ left
         * @param {HTMLElement} element - The target element
         * @param {HTMLElement} badge - The badge element to position
         * @returns {{top: number, left: number, side: string}} Position coordinates and side
         */
        calculatePosition(element, badge) {
            const elementRect = element.getBoundingClientRect();
            const badgeRect = badge.getBoundingClientRect();

            // Define all possible positions with their fit checks
            const positions = [
                {
                    side: "top",
                    calc: () => ({
                        top: elementRect.top - badgeRect.height - this.GAP,
                        left: elementRect.left - 4.5, // Align with outline outer edge (3px offset + 1.5px stroke)
                    }),
                    fits: (pos) => pos.top >= this.VIEWPORT_PADDING,
                },
                {
                    side: "bottom",
                    calc: () => ({
                        top: elementRect.bottom + this.GAP,
                        left: elementRect.left - 4.5, // Align with outline outer edge (3px offset + 1.5px stroke)
                    }),
                    fits: (pos) =>
                        pos.top + badgeRect.height <=
                        window.innerHeight - this.VIEWPORT_PADDING,
                },
                {
                    side: "left",
                    calc: () => ({
                        top: elementRect.top,
                        left: elementRect.left - badgeRect.width - this.GAP,
                    }),
                    fits: (pos) => pos.left >= this.VIEWPORT_PADDING,
                },
                {
                    side: "right",
                    calc: () => ({
                        top: elementRect.top,
                        left: elementRect.right + this.GAP,
                    }),
                    fits: (pos) =>
                        pos.left + badgeRect.width <=
                        window.innerWidth - this.VIEWPORT_PADDING,
                },
            ];

            // Try each position in order until one fits
            for (const position of positions) {
                const pos = position.calc();

                // Adjust horizontal position to prevent left/right edge clipping
                if (position.side === "top" || position.side === "bottom") {
                    // Check if badge extends beyond right edge
                    if (
                        pos.left + badgeRect.width >
                        window.innerWidth - this.VIEWPORT_PADDING
                    ) {
                        pos.left =
                            window.innerWidth - badgeRect.width - this.VIEWPORT_PADDING;
                    }
                    // Check if badge extends beyond left edge
                    if (pos.left < this.VIEWPORT_PADDING) {
                        pos.left = this.VIEWPORT_PADDING;
                    }
                }

                // Adjust vertical position for left/right positions
                if (position.side === "left" || position.side === "right") {
                    // Check if badge extends beyond bottom edge
                    if (
                        pos.top + badgeRect.height >
                        window.innerHeight - this.VIEWPORT_PADDING
                    ) {
                        pos.top =
                            window.innerHeight - badgeRect.height - this.VIEWPORT_PADDING;
                    }
                    // Check if badge extends beyond top edge
                    if (pos.top < this.VIEWPORT_PADDING) {
                        pos.top = this.VIEWPORT_PADDING;
                    }
                }

                if (position.fits(pos)) {
                    return { ...pos, side: position.side };
                }
            }

            // Fallback: constrain to viewport (should rarely happen)
            const fallback = positions[0].calc();
            return {
                top: Math.max(
                    this.VIEWPORT_PADDING,
                    Math.min(
                        fallback.top,
                        window.innerHeight - badgeRect.height - this.VIEWPORT_PADDING,
                    ),
                ),
                left: Math.max(
                    this.VIEWPORT_PADDING,
                    Math.min(
                        fallback.left,
                        window.innerWidth - badgeRect.width - this.VIEWPORT_PADDING,
                    ),
                ),
                side: "constrained",
            };
        }

        /**
         * Positions a badge relative to its target element
         * @param {HTMLElement} element - The target element
         * @param {HTMLElement} badge - The badge element to position
         * @param {boolean} fadeIn - Whether to fade in the badge (default: true)
         */
        positionBadge(element, badge, fadeIn = true) {
            const position = this.calculatePosition(element, badge);
            badge.style.top = `${position.top}px`;
            badge.style.left = `${position.left}px`;
            badge.dataset.side = position.side;

            // Fade in the badge (only on initial creation, not during reposition)
            if (fadeIn) {
                requestAnimationFrame(() => {
                    badge.style.opacity = "1";
                });
            }
        }

        /**
         * Shows a hover badge for an element
         * @param {HTMLElement} element - The target element
         * @param {string} label - The badge label
         * @param {boolean} isDynamic - Whether the element is dynamic
         * @returns {HTMLElement} The created badge element
         */
        showHoverBadge(element, label, isDynamic = false) {
            const type = isDynamic ? "dynamic" : "hover";
            const badge = this.createBadge(label, type);
            this.positionBadge(element, badge);
            return badge;
        }

        /**
         * Shows a selected badge for an element
         * @param {HTMLElement} element - The target element
         * @param {string} label - The badge label
         * @param {boolean} isDynamic - Whether this is a dynamic element (orange badge)
         * @returns {HTMLElement} The created badge element
         */
        showSelectedBadge(element, label, isDynamic = false) {
            const badgeType = isDynamic ? "selected-dynamic" : "selected";
            const badge = this.createBadge(label, badgeType);
            this.positionBadge(element, badge);
            return badge;
        }

        /**
         * Removes a badge element from the DOM
         * @param {HTMLElement} badge - The badge to remove
         */
        removeBadge(badge) {
            if (!badge) return;

            // Cancel existing removal timeout if badge is already being removed
            if (this.removalTimeouts.has(badge)) {
                clearTimeout(this.removalTimeouts.get(badge));
                this.removalTimeouts.delete(badge);
            }

            if (badge.parentElement) {
                badge.style.opacity = "0";
                const timeoutId = setTimeout(() => {
                    if (badge.parentElement) {
                        badge.parentElement.removeChild(badge);
                    }
                    this.removalTimeouts.delete(badge);
                }, 150); // Match CSS transition duration

                this.removalTimeouts.set(badge, timeoutId);
            }
        }

        /**
         * Clean up all pending badge removals (called on deactivate)
         */
        cleanup() {
            // Clear all pending removal timeouts
            this.removalTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
            this.removalTimeouts.clear();

            // Remove all badges immediately
            document.querySelectorAll(".debug-badge").forEach((badge) => {
                if (badge.parentElement) {
                    badge.parentElement.removeChild(badge);
                }
            });
        }

        /**
         * Updates the position of a badge (for scroll/resize events)
         * @param {HTMLElement} element - The target element
         * @param {HTMLElement} badge - The badge to reposition
         */
        updateBadgePosition(element, badge) {
            if (badge && element) {
                this.positionBadge(element, badge, false); // Don't fade in during reposition
            }
        }
    }

    // Create global badge manager instance
    const badgeManager = new BadgeManager();

    // Utility functions
    function rgbToHex(rgb) {
        // Handle rgb(r, g, b) and rgba(r, g, b, a) formats
        const match = rgb.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;

        const values = match[1].split(",").map((v) => parseFloat(v.trim()));
        if (values.length < 3) return null;

        const r = Math.round(values[0]);
        const g = Math.round(values[1]);
        const b = Math.round(values[2]);

        return (
            "#" +
            [r, g, b]
                .map((x) => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? "0" + hex : hex;
                })
                .join("")
                .toUpperCase()
        );
    }

    function extractOpacity(color) {
        // Extract alpha from rgba() or return 1 for rgb()
        const match = color.match(/rgba?\(([^)]+)\)/);
        if (!match) return 1;

        const values = match[1].split(",").map((v) => parseFloat(v.trim()));
        return values.length === 4 ? values[3] : 1;
    }

    function parseColor(colorValue) {
        if (
            !colorValue ||
            colorValue === "transparent" ||
            colorValue === "rgba(0, 0, 0, 0)"
        ) {
            return { hex: null, opacity: 0, hasColor: false };
        }

        const hex = rgbToHex(colorValue);
        const opacity = extractOpacity(colorValue);

        return {
            hex: hex,
            opacity: Math.round(opacity * 100), // Convert to percentage
            hasColor: true,
        };
    }

    function sendMessageToParent(data) {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage(
                    {
                        type: "SITE_DEBUG",
                        source: window.location.href,
                        timestamp: Date.now(),
                        ...data,
                    },
                    CONFIG.PARENT_ORIGIN,
                );
            } catch (error) {
                // Silently fail
            }
        }
    }

    function getDirectTextContent(element) {
        // Extract only direct text nodes, not from child elements
        let text = "";
        for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            }
        }
        return text.trim();
    }

    // Check if element is dynamic (not directly editable)
    // Dynamic means either:
    // 1. Element has x-dynamic="true" (has expression content like {variable})
    // 2. Element is multi-instance (rendered via .map(), multiple DOM elements with same x-id)
    function isElementDynamic(element) {
        // Check the element's own x-dynamic attribute (has expressions)
        if (element.getAttribute("x-dynamic") === "true") {
            return true;
        }

        // Check if this element is multi-instance (from .map() rendering)
        // If there are multiple DOM elements with the same x-id, it's multi-instance
        const elementId = element.getAttribute("x-id");
        if (elementId) {
            const instances = document.querySelectorAll(`[x-id="${elementId}"]`);
            if (instances.length > 1) {
                return true;
            }
        }

        return false;
    }

    function getElementInfo(element) {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);

        // Extract color information
        const textColor = parseColor(computedStyle.color);
        const backgroundColor = parseColor(computedStyle.backgroundColor);
        const borderColor = parseColor(computedStyle.borderColor);

        // Get only direct text content (not from child elements)
        const directText = getDirectTextContent(element);
        const hasDirectTextContent = directText.length > 0;

        const childElementCount = element.children ? element.children.length : 0;

        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            textContent: directText || null,
            hasDirectTextContent: hasDirectTextContent,
            hasChildElements: childElementCount > 0,
            childElementCount: childElementCount,
            attributes: Array.from(element.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {}),
            rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            },
            computedStyles: {
                color: textColor,
                backgroundColor: backgroundColor,
                borderColor: borderColor,
                fontSize: computedStyle.fontSize,
                fontWeight: computedStyle.fontWeight,
                fontFamily: computedStyle.fontFamily,
                textAlign: computedStyle.textAlign,
                lineHeight: computedStyle.lineHeight,
                letterSpacing: computedStyle.letterSpacing,
                textDecoration: computedStyle.textDecoration,
                fontStyle: computedStyle.fontStyle,
                display: computedStyle.display,
                position: computedStyle.position,
                marginTop: computedStyle.marginTop,
                marginRight: computedStyle.marginRight,
                marginBottom: computedStyle.marginBottom,
                marginLeft: computedStyle.marginLeft,
                paddingTop: computedStyle.paddingTop,
                paddingRight: computedStyle.paddingRight,
                paddingBottom: computedStyle.paddingBottom,
                paddingLeft: computedStyle.paddingLeft,
            },
        };
    }

    // Visual highlighting system
    function createStyles() {
        const style = document.createElement("style");
        style.id = "debug-monitor-styles";
        style.textContent = `
            /* Hover state - dotted lines (editable elements) */
            [data-debug-hover]:not([data-debug-selected]):not([data-debug-dynamic]) {
                outline: 2px dotted #5288CC !important;
                outline-offset: 2px !important;
            }

            /* Hover state for dynamic elements (not editable) - orange/warning color */
            [data-debug-hover][data-debug-dynamic]:not([data-debug-selected]) {
                outline: 2px dotted #FF8C42 !important;
                outline-offset: 2px !important;
            }

            /* Selected state - solid lines */
            [data-debug-selected]:not([data-debug-dynamic]) {
                outline: 1.5px solid #2764EB !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 0 1px rgba(39, 100, 235, 0.3), inset 0 0 0 999px rgba(39, 100, 235, 0.05) !important;
            }

            /* Selected state for dynamic elements - orange solid */
            [data-debug-selected][data-debug-dynamic] {
                outline: 1.5px solid #FF8C42 !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 0 1px rgba(255, 140, 66, 0.3), inset 0 0 0 999px rgba(255, 140, 66, 0.05) !important;
            }

            /* Badge element styles (created dynamically in JS) */
            .debug-badge {
                position: fixed;
                z-index: ${CONFIG.Z_INDEX};
                pointer-events: none;
                padding: 4px 6px 4px 22px;
                border-radius: 6px;
                font-size: 11px;
                font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-weight: bold;
                white-space: nowrap;
                background-repeat: no-repeat;
                background-position: 4px center;
                background-size: 14px 14px;
                transition: top 0.15s ease-out, left 0.15s ease-out, opacity 0.15s ease-out;
            }

            /* Badge variants */
            .debug-badge.hover {
                background-color: #DBEAFE;
                border: 1px solid #B5CBF6;
                color: #1E4ED8;
                background-image: url('data:image/svg+xml;utf8,<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.93934 1.06066L7 0L8.06066 1.06066L12.9393 5.93934L14 7L12.9393 8.06066L8.06066 12.9393L7 14L5.93934 12.9393L1.06066 8.06066L0 7L1.06066 5.93934L5.93934 1.06066ZM2.12132 7L7 11.8787L11.8787 7L7 2.12132L2.12132 7Z" fill="%231E4ED8"/></svg>');
            }

            .debug-badge.dynamic {
                background-color: #FFF5E6;
                border: 1px solid #FFCC99;
                color: #CC5500;
                background-image: url('data:image/svg+xml;utf8,<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" fill="%23CC5500"/></svg>');
            }

            .debug-badge.selected {
                background-color: #1E4ED8;
                border: 1px solid #1E4ED8;
                color: white;
                background-image: url('data:image/svg+xml;utf8,<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.93934 1.06066L7 0L8.06066 1.06066L12.9393 5.93934L14 7L12.9393 8.06066L8.06066 12.9393L7 14L5.93934 12.9393L1.06066 8.06066L0 7L1.06066 5.93934L5.93934 1.06066ZM2.12132 7L7 11.8787L11.8787 7L7 2.12132L2.12132 7Z" fill="white"/></svg>');
            }

            .debug-badge.selected-dynamic {
                background-color: #FF8C42;
                border: 1px solid #FF8C42;
                color: white;
                background-image: url('data:image/svg+xml;utf8,<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" fill="white"/></svg>');
            }


            /* Ensure debug badges are always visible */
            .debug-badge {
                pointer-events: none !important;
                display: block !important;
            }
        `;
        document.head.appendChild(style);
    }

    const INTERACTION_BLOCK_EVENTS = [
        "pointerdown",
        "pointerup",
        "touchstart",
        "touchend",
        "mousedown",
        "mouseup",
        "contextmenu",
    ];

    // Prevent interactive behavior when we're in select mode
    function blockInteractiveEvent(event) {
        if (!state.isActive) return;
        if (state.interactionMode !== "select") return;

        // Allow modifier-assisted interactions (e.g., holding meta for native browser behavior)
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
    }

    // Event handlers - simplified for click-only selection

    function handleClick(event) {
        if (!state.isActive) return;

        // PREVIEW MODE: Allow normal interaction, don't intercept
        if (state.interactionMode === "preview") {
            return;
        }

        // SELECT MODE: Intercept for element selection
        event.preventDefault();
        event.stopPropagation();

        const element = event.target;

        // Exclude SVG elements from selection
        if (element.tagName && element.tagName.toLowerCase() === "svg") {
            return;
        }

        // Exclude specific non-editable elements by ID
        if (element.id === "emergent-badge") {
            return;
        }

        // Exclude Toast and Sonner components from selection
        const componentName = element.getAttribute("x-component");
        if (
            componentName &&
            (componentName.startsWith("Toast") ||
                componentName === "Toaster" ||
                componentName === "Sonner")
        ) {
            return;
        }

        // Check if element is inside a Toast/Sonner component
        const toastParent = element.closest(
            '[x-component^="Toast"], [x-component="Toaster"], [x-component="Sonner"]'
        );
        if (toastParent) {
            return;
        }

        const elementInfo = getElementInfo(element);

        // Ensure element has x-id for tracking (assign temp ID if missing)
        // This is needed for pendingChanges queue and DOM targeting
        if (!elementInfo.attributes["x-id"]) {
            const generatedId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            element.setAttribute("x-id", generatedId);
            elementInfo.attributes["x-id"] = generatedId;
        }
        // Validate that element has required metadata attributes
        // Elements without metadata are not part of React component tree and can't be edited
        const hasRequiredMetadata =
            elementInfo.attributes["x-file-name"] &&
            elementInfo.attributes["x-line-number"] &&
            elementInfo.attributes["x-component"];

        if (!hasRequiredMetadata) {
            return;
        }

        // Check if element is dynamic (from array iteration)
        // This checks the element AND ancestors - handles components rendered via .map()
        // where child elements in separate files weren't marked dynamic at build time
        const isDynamic = isElementDynamic(element);

        // Clear previous selection
        if (state.selectedElement && state.selectedElement !== element) {
            // Clear previous single element selection
            state.selectedElement.removeAttribute("data-debug-selected");
            if (state.selectedBadge) {
                badgeManager.removeBadge(state.selectedBadge);
                state.selectedBadge = null;
            }

            // Clear previous group selection
            state.selectedGroup.forEach((el) => {
                el.removeAttribute("data-debug-selected");
            });
            state.selectedBadges.forEach((badge) => {
                badgeManager.removeBadge(badge);
            });
            state.selectedGroup = [];
            state.selectedBadges = [];
        }

        // Select new element (or deselect if clicking the same element)
        if (state.selectedElement === element) {
            // Deselect
            state.selectedElement = null;
            element.removeAttribute("data-debug-selected");

            // Remove badge(s)
            if (state.selectedBadge) {
                badgeManager.removeBadge(state.selectedBadge);
                state.selectedBadge = null;
            }
            state.selectedGroup.forEach((el) => {
                el.removeAttribute("data-debug-selected");
                el.removeAttribute("data-debug-dynamic");
            });
            state.selectedBadges.forEach((badge) => {
                badgeManager.removeBadge(badge);
            });
            state.selectedGroup = [];
            state.selectedBadges = [];

            sendMessageToParent({
                action: "ELEMENT_DESELECTED",
            });
        } else {
            // Select new element
            state.selectedElement = element;

            // For dynamic elements, find ALL elements with the same x-id
            if (isDynamic && elementInfo.attributes["x-id"]) {
                const elementId = elementInfo.attributes["x-id"];
                const allElements = document.querySelectorAll(`[x-id="${elementId}"]`);
                state.selectedGroup = Array.from(allElements).filter(Boolean);

                // Mark all elements as selected with dynamic flag
                state.selectedGroup.forEach((el) => {
                    el.setAttribute("data-debug-selected", "true");
                    el.setAttribute("data-debug-dynamic", "true");
                });

                // Create badge for the clicked element (not always first)
                const label = `${element.tagName.toLowerCase()} (Dynamic)`;
                const badge = badgeManager.showSelectedBadge(element, label, true);
                state.selectedBadges = [badge]; // Single badge in array
            } else {
                // Single element selection (non-dynamic)
                element.setAttribute("data-debug-selected", "true");
                const label = element.tagName.toLowerCase();
                state.selectedBadge = badgeManager.showSelectedBadge(
                    element,
                    label,
                    false,
                );
            }

            // Get element position for widget placement
            // Use viewport-relative coordinates (no scroll offset)
            // Parent will add iframe position to convert to parent viewport coordinates
            const rect = element.getBoundingClientRect();

            sendMessageToParent({
                action: "ELEMENT_SELECTED",
                element: elementInfo,
                isDynamic: isDynamic,
                elementCount: isDynamic ? state.selectedGroup.length : 1,
                isMultiElement: isDynamic && state.selectedGroup.length > 1,
                position: {
                    x: rect.left,
                    y: rect.bottom, // Position below the element
                    width: rect.width,
                    height: rect.height,
                    elementRect: {
                        top: rect.top,
                        left: rect.left,
                        bottom: rect.bottom,
                        right: rect.right,
                    },
                },
            });
        }
    }

    // Message handler for parent communication
    function handleParentMessage(event) {
        // For security, you should set CONFIG.PARENT_ORIGIN to your actual parent origin
        if (event.origin !== CONFIG.PARENT_ORIGIN && CONFIG.PARENT_ORIGIN !== "*")
            return;

        const { type, action, data } = event.data;

        if (type !== "DEBUG_COMMAND") return;

        switch (action) {
            case "ACTIVATE":
                activateDebugMode();
                break;
            case "DEACTIVATE":
                deactivateDebugMode();
                break;
            case "CLEAR_SELECTION":
                clearSelection();
                break;
            case "APPLY_CHANGES":
                applyElementChanges(event.data.data);
                break;
            case "SET_INTERACTION_MODE":
                setInteractionMode(data.mode);
                break;
        }
    }

    // Hover handlers
    function handleMouseEnter(event) {
        if (!state.isActive) return;

        // PREVIEW MODE: No hover effects
        if (state.interactionMode === "preview") {
            return;
        }

        // SELECT MODE: Show hover effects
        const element = event.target;

        // Validate element is a proper DOM Element node
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

        // Don't add hover effect to already selected element
        if (element.hasAttribute("data-debug-selected")) return;

        // Exclude SVG elements from hover highlighting
        if (element.tagName && element.tagName.toLowerCase() === "svg") {
            return;
        }

        // Exclude specific non-editable elements by ID
        if (element.id === "emergent-badge") {
            return;
        }

        // Exclude Toast and Sonner components from hover
        const componentName = element.getAttribute("x-component");
        if (
            componentName &&
            (componentName.startsWith("Toast") ||
                componentName === "Toaster" ||
                componentName === "Sonner")
        ) {
            return;
        }

        // Check if element has required metadata attributes
        // Elements without metadata are not part of React component tree
        const hasRequiredMetadata =
            element.hasAttribute("x-file-name") &&
            element.hasAttribute("x-line-number") &&
            element.hasAttribute("x-component");

        if (!hasRequiredMetadata) {
            return;
        }

        // Check if element is dynamic (checks element AND ancestors)
        const isDynamic = isElementDynamic(element);

        // For dynamic elements, highlight ALL instances with same x-id
        if (isDynamic) {
            const elementId =
                element.getAttribute("x-id") ||
                element.closest("[x-id]")?.getAttribute("x-id");

            if (elementId) {
                // Find all elements with same x-id
                const allElements = document.querySelectorAll(`[x-id="${elementId}"]`);
                state.hoverGroup = Array.from(allElements).filter(Boolean);

                // Check if ANY element in the group is selected
                const anySelected = state.hoverGroup.some((el) =>
                    el.hasAttribute("data-debug-selected"),
                );

                if (anySelected) {
                    // Don't show hover effects if group is already selected
                    state.hoverGroup = [];
                    return;
                }

                // Mark all elements with hover + dynamic
                state.hoverGroup.forEach((el) => {
                    el.setAttribute("data-debug-hover", "true");
                    el.setAttribute("data-debug-dynamic", "true");
                });
            } else {
                // Fallback: single element if no x-id found
                element.setAttribute("data-debug-hover", "true");
                element.setAttribute("data-debug-dynamic", "true");
            }
        } else {
            // Single element hover (non-dynamic)
            element.setAttribute("data-debug-hover", "true");
        }

        // Create and show badge
        const label = isDynamic
            ? `${element.tagName.toLowerCase()} (Dynamic)`
            : element.tagName.toLowerCase();

        // Remove previous hover badge if exists
        if (state.hoverBadge) {
            badgeManager.removeBadge(state.hoverBadge);
        }

        // Store target element reference for repositioning
        state.hoverTarget = element;
        state.hoverBadge = badgeManager.showHoverBadge(element, label, isDynamic);
    }

    function handleMouseLeave(event) {
        if (!state.isActive) return;

        // PREVIEW MODE: No hover effects to remove
        if (state.interactionMode === "preview") {
            return;
        }

        // SELECT MODE: Remove hover effects
        const element = event.target;

        // Validate element is a proper DOM Element node
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

        // Clear single element or all elements in hoverGroup
        if (state.hoverGroup.length > 0) {
            // Multi-element hover - clear all
            state.hoverGroup.forEach((el) => {
                el.removeAttribute("data-debug-hover");
                // Only remove data-debug-dynamic if element is not selected
                if (!el.hasAttribute("data-debug-selected")) {
                    el.removeAttribute("data-debug-dynamic");
                }
            });
            state.hoverGroup = [];
        } else {
            // Single element hover - clear just this one
            element.removeAttribute("data-debug-hover");
            // Only remove data-debug-dynamic if element is not selected
            if (!element.hasAttribute("data-debug-selected")) {
                element.removeAttribute("data-debug-dynamic");
            }
        }

        // Remove hover badge and clear target reference
        if (state.hoverBadge) {
            badgeManager.removeBadge(state.hoverBadge);
            state.hoverBadge = null;
            state.hoverTarget = null;
        }
    }

    // Badge repositioning on scroll/resize
    let repositionTimeout;
    function handleBadgeReposition() {
        // Immediately hide badges and disable transitions to prevent visual lag during scroll
        if (state.hoverBadge) {
            state.hoverBadge.style.opacity = "0";
            state.hoverBadge.style.transition = "none";
        }
        if (state.selectedBadge) {
            state.selectedBadge.style.opacity = "0";
            state.selectedBadge.style.transition = "none";
        }
        if (state.selectedBadges.length > 0) {
            state.selectedBadges.forEach((badge) => {
                badge.style.opacity = "0";
                badge.style.transition = "none";
            });
        }

        clearTimeout(repositionTimeout);
        repositionTimeout = setTimeout(() => {
            // Cancel pending RAF to prevent stacking
            if (state.repositionRAF) {
                cancelAnimationFrame(state.repositionRAF);
            }

            state.repositionRAF = requestAnimationFrame(() => {
                // Reposition hover badge using stored target reference
                if (state.hoverBadge && state.hoverTarget) {
                    badgeManager.updateBadgePosition(state.hoverTarget, state.hoverBadge);
                    // Force reflow to commit position changes before re-enabling transitions
                    void state.hoverBadge.offsetHeight;
                    // Re-enable transitions and show badge
                    state.hoverBadge.style.transition = "";
                    state.hoverBadge.style.opacity = "1";
                }

                // Reposition selected badge (single element)
                if (state.selectedBadge && state.selectedElement) {
                    badgeManager.updateBadgePosition(
                        state.selectedElement,
                        state.selectedBadge,
                    );
                    // Force reflow to commit position changes before re-enabling transitions
                    void state.selectedBadge.offsetHeight;
                    // Re-enable transitions and show badge
                    state.selectedBadge.style.transition = "";
                    state.selectedBadge.style.opacity = "1";
                }

                // Reposition badge for multi-element selection (only first element has badge)
                if (state.selectedBadges.length > 0 && state.selectedGroup.length > 0) {
                    badgeManager.updateBadgePosition(
                        state.selectedGroup[0],
                        state.selectedBadges[0],
                    );
                    // Force reflow to commit position changes before re-enabling transitions
                    void state.selectedBadges[0].offsetHeight;
                    // Re-enable transitions and show badge
                    state.selectedBadges[0].style.transition = "";
                    state.selectedBadges[0].style.opacity = "1";
                }

                state.repositionRAF = null;
            });
        }, 50); // 50ms debounce for smooth performance
    }

    // Debug mode controls
    function activateDebugMode() {
        state.isActive = true;
        // Set cursor based on current mode
        document.body.style.cursor =
            state.interactionMode === "select" ? "crosshair" : "default";

        // Add class to body for select mode to disable hover components
        if (state.interactionMode === "select") {
            document.body.classList.add("debug-select-mode");
        }

        // Add event listeners
        document.addEventListener("click", handleClick, true);
        document.addEventListener("mouseover", handleMouseEnter, true);
        document.addEventListener("mouseout", handleMouseLeave, true);

        INTERACTION_BLOCK_EVENTS.forEach((eventName) => {
            document.addEventListener(eventName, blockInteractiveEvent, true);
        });

        // Add scroll and resize listeners for badge repositioning
        window.addEventListener("scroll", handleBadgeReposition, { passive: true });
        window.addEventListener("resize", handleBadgeReposition, { passive: true });

        sendMessageToParent({
            action: "DEBUG_MODE_ACTIVATED",
            url: window.location.href,
        });
    }

    function deactivateDebugMode() {
        state.isActive = false;
        document.body.style.cursor = "";
        document.body.classList.remove("debug-select-mode");

        // Remove event listeners
        document.removeEventListener("click", handleClick, true);
        document.removeEventListener("mouseover", handleMouseEnter, true);
        document.removeEventListener("mouseout", handleMouseLeave, true);
        INTERACTION_BLOCK_EVENTS.forEach((eventName) => {
            document.removeEventListener(eventName, blockInteractiveEvent, true);
        });
        window.removeEventListener("scroll", handleBadgeReposition);
        window.removeEventListener("resize", handleBadgeReposition);

        // Clear pending timers and RAF
        clearTimeout(repositionTimeout);
        repositionTimeout = null;

        if (state.repositionRAF) {
            cancelAnimationFrame(state.repositionRAF);
            state.repositionRAF = null;
        }

        // Clear selection
        clearSelection();

        // Clean up all pending badge removals
        badgeManager.cleanup();

        sendMessageToParent({
            action: "DEBUG_MODE_DEACTIVATED",
        });
    }

    function clearSelection() {
        if (state.selectedElement) {
            state.selectedElement.removeAttribute("data-debug-selected");
            state.selectedElement = null;
        }

        // Remove selected badge (single element)
        if (state.selectedBadge) {
            badgeManager.removeBadge(state.selectedBadge);
            state.selectedBadge = null;
        }

        // Clear all elements in multi-element selection
        state.selectedGroup.forEach((el) => {
            el.removeAttribute("data-debug-selected");
            el.removeAttribute("data-debug-dynamic");
        });
        state.selectedGroup = [];

        // Remove all badges in multi-element selection
        state.selectedBadges.forEach((badge) => {
            badgeManager.removeBadge(badge);
        });
        state.selectedBadges = [];

        // Remove hover badge
        if (state.hoverBadge) {
            badgeManager.removeBadge(state.hoverBadge);
            state.hoverBadge = null;
        }

        // Clear all hover effects
        const hoveredElements = document.querySelectorAll("[data-debug-hover]");
        hoveredElements.forEach((el) => {
            el.removeAttribute("data-debug-hover");
            el.removeAttribute("data-debug-dynamic");
        });

        sendMessageToParent({
            action: "ELEMENT_DESELECTED",
        });
    }

    function setInteractionMode(mode) {
        state.interactionMode = mode;

        // Update cursor based on mode
        if (state.isActive) {
            document.body.style.cursor = mode === "select" ? "crosshair" : "default";

            // Add/remove class for select mode
            if (mode === "select") {
                document.body.classList.add("debug-select-mode");
            } else {
                document.body.classList.remove("debug-select-mode");
            }
        }

        sendMessageToParent({
            action: "INTERACTION_MODE_CHANGED",
            mode: mode,
        });
    }

    // Apply changes to the selected element or by element ID
    function applyElementChanges(changes) {
        let targetElements = [];

        // If elementId is provided, find element(s) by x-id attribute
        if (changes.elementId) {
            // Check if this is a multi-element update (dynamic content)
            if (changes.isMultiElement) {
                const elements = document.querySelectorAll(
                    `[x-id="${changes.elementId}"]`,
                );
                targetElements = Array.from(elements).filter(Boolean);
            } else {
                const element = document.querySelector(`[x-id="${changes.elementId}"]`);
                if (!element) {
                    sendMessageToParent({
                        action: "CHANGES_ERROR",
                        error: `Element not found: x-id="${changes.elementId}"`,
                        elementId: changes.elementId,
                    });
                    return;
                }

                targetElements = [element];
            }
        } else {
            // Fallback to selected element for backwards compatibility
            if (!state.selectedElement) {
                sendMessageToParent({
                    action: "CHANGES_ERROR",
                    error: "No element selected and no elementId provided",
                });
                return;
            }
            targetElements = [state.selectedElement];
        }

        if (targetElements.length === 0) {
            sendMessageToParent({
                action: "CHANGES_ERROR",
                error: "No elements found",
                elementId: changes.elementId,
            });
            return;
        }

        let applied = [];

        try {
            // Apply changes to all target elements
            targetElements.forEach((element, index) => {
                // Apply text content changes ONLY if element has direct text content
                // Skip for multi-element updates (dynamic content should not have content changes)
                if (changes.textContent !== undefined && !changes.isMultiElement) {
                    const hasDirectText =
                        element.getAttribute("x-direct-text") === "true";
                    const hasChildren = element.children && element.children.length > 0;

                    if (hasDirectText || !hasChildren) {
                        // Safe to apply textContent: element has direct text OR no children
                        element.textContent = changes.textContent;
                        if (index === 0) applied.push("textContent");
                    } else {
                        // Mixed content: update an existing text node (or create one) without touching child elements
                        const textNodes = Array.from(element.childNodes).filter(
                            (node) => node.nodeType === Node.TEXT_NODE,
                        );
                        const firstTextNode =
                            textNodes.find(
                                (node) =>
                                    node.textContent && node.textContent.trim().length > 0,
                            ) || textNodes[0];

                        if (firstTextNode) {
                            // Preserve original leading/trailing whitespace if the update omits it
                            const originalText = firstTextNode.textContent || "";
                            const originalLeading = (originalText.match(/^\s+/) || [""])[0];
                            const originalTrailing = (originalText.match(/\s+$/) || [""])[0];
                            const updateLeading = (changes.textContent.match(/^\s+/) || [
                                "",
                            ])[0];
                            const updateTrailing = (changes.textContent.match(/\s+$/) || [
                                "",
                            ])[0];
                            const coreText = changes.textContent.trim();
                            firstTextNode.textContent = `${updateLeading || originalLeading}${coreText}${updateTrailing || originalTrailing}`;
                        } else {
                            const textNode = document.createTextNode(changes.textContent);
                            element.insertBefore(textNode, element.firstChild || null);
                        }

                        if (index === 0) {
                            applied.push("textContent");
                        }
                    }
                }

                // Apply class changes
                if (changes.className !== undefined) {
                    element.className = changes.className;
                    if (index === 0) applied.push("className");
                }

                // Apply ID changes (only for single element - multiple elements can't share same ID)
                if (changes.id !== undefined && !changes.isMultiElement) {
                    if (changes.id) {
                        element.id = changes.id;
                    } else {
                        element.removeAttribute("id");
                    }
                    if (index === 0) applied.push("id");
                }

                // Apply custom attributes
                if (changes.attributes && typeof changes.attributes === "object") {
                    Object.entries(changes.attributes).forEach(([key, value]) => {
                        if (value) {
                            element.setAttribute(key, value);
                        } else {
                            element.removeAttribute(key);
                        }
                    });
                    if (index === 0) applied.push("attributes");
                }
            });
        } catch (error) {
            sendMessageToParent({
                action: "CHANGES_ERROR",
                error: error.message,
                elementId: changes.elementId,
            });
        }
    }

    // Initialize
    function init() {
        // Only run if we're in an iframe
        if (window.parent === window) {
            return;
        }

        createStyles();

        // Set up communication
        window.addEventListener("message", handleParentMessage);
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Expose controls globally for manual testing
    window.siteDebugMonitor = {
        activate: activateDebugMode,
        deactivate: deactivateDebugMode,
        clearSelection: clearSelection,
        getState: () => ({ ...state }),
    };
})();