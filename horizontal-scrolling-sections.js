/**
 * Horizontal Scrolling Sections Plugin for Squarespace
 * Copyright Will-Myers.com
 **/

(function () {
  // ============================================================================
  // UTILITIES CLASS
  // ============================================================================
  /**
   * General utility functions used throughout the plugin
   */
  class Utilities {
    /**
     * Parse data attribute values and convert them to appropriate types
     * @param {string} value - The value to parse
     * @returns {boolean|number|string} - Parsed value
     */
    static parseAttributeValue(value) {
      if (value === "true") return true;
      if (value === "false") return false;
      const number = parseFloat(value);
      if (!isNaN(number) && number.toString() === value) return number;
      return value;
    }

    /**
     * Emit a custom event from an element
     * @param {string} type - Event name
     * @param {Object} detail - Event detail object
     * @param {Element} elem - Element to dispatch from (default: document)
     */
    static emitEvent(type, detail = {}, elem = document) {
      if (!type) return;

      const event = new CustomEvent(type, {
        bubbles: true,
        cancelable: true,
        detail: detail,
      });

      return elem.dispatchEvent(event);
    }

    /**
     * Deep merge multiple objects
     * @param {...Object} objs - Objects to merge
     * @returns {Object} - Merged object
     */
    static deepMerger(...objs) {
      function getType(obj) {
        return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
      }

      function mergeObj(clone, obj) {
        for (let [key, value] of Object.entries(obj)) {
          let type = getType(value);
          if (type === "object" || type === "array") {
            if (clone[key] === undefined) {
              clone[key] = type === "object" ? {} : [];
            }
            mergeObj(clone[key], value);
          } else if (type === "function") {
            clone[key] = value;
          } else {
            clone[key] = value;
          }
        }
      }

      if (objs.length === 0) return {};

      let clone = {};
      objs.forEach(obj => {
        mergeObj(clone, obj);
      });
      return clone;
    }
  }

  // ============================================================================
  // MAIN PLUGIN CLASS
  // ============================================================================
  /**
   * Main class that handles horizontal scrolling behavior
   */
  class WMHorizontalScrolling {
    /**
     * Create a new horizontal scrolling instance
     * @param {Element} el - The horizontal scroll container element
     * @param {Element} initEl - The original plugin trigger element
     * @param {Object} settings - Plugin settings
     */
    constructor(el, initEl, settings) {
      this.el = el; // The container we create
      this.initEl = initEl; // The original div with data-wm-plugin
      this.settings = settings;

      // Store references to key elements and measurements
      this.scrollWrapper = null;
      this.horizontalGroup = {
        container: null,
        scrollWrapper: null,
        start: 0,
        end: 0,
        distance: 0,
      };

      // Scroll optimization
      this.ticking = false;
      this.lastScrollTop = window.pageYOffset;
      this.prevWidth = window.innerWidth;

      this.init();
    }

    /**
     * Initialize the plugin
     */
    init() {
      this.horizontalGroup.container = this.el;
      this.horizontalGroup.scrollWrapper = this.el.querySelector(".wm-hs-scroll-wrapper");
      this.updateMeasurements();
      this.bindEvents();

      // Emit initialization event
      Utilities.emitEvent(`${nameSpace}:init`, {
        container: this.el,
        instance: this,
      });
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
      this.addScrollEventListener();
      this.addResizeEventListener();
      this.addClickEventListener();
      this.handleHashNavigation();
    }

    /**
     * Add scroll event listener with RAF optimization
     */
    addScrollEventListener() {
      window.addEventListener("scroll", () => {
        this.lastScrollTop = window.pageYOffset;

        // Use requestAnimationFrame to throttle scroll updates
        if (!this.ticking) {
          window.requestAnimationFrame(() => {
            this.handleScroll();
            this.ticking = false;
          });
          this.ticking = true;
        }
      });
    }

    /**
     * Handle scroll position and translate the horizontal wrapper
     */
    handleScroll() {
      const { container, scrollWrapper, start, end, distance } = this.horizontalGroup;
      if (!container || !scrollWrapper) return;

      // Determine if we're in the active scroll region
      if (this.lastScrollTop >= start && this.lastScrollTop <= end) {
        // Calculate how far through the scroll region we are (0 to 1)
        const percentage = (this.lastScrollTop - start) / (end - start);

        // Convert that percentage to horizontal scroll distance
        const horizontalScroll = Math.min(Math.max(0, percentage * distance), distance);

        // Apply the transform (reversed if settings.reverse is true)
        if (this.settings.reverse) {
          // Reverse: start at left, scroll right
          scrollWrapper.style.transform = `translateX(-${distance - horizontalScroll}px)`;
        } else {
          // Normal: start at right, scroll left
          scrollWrapper.style.transform = `translateX(-${horizontalScroll}px)`;
        }

        // Emit section enter event if we're just entering
        if (this.lastScrollTop - 1 < start) {
          Utilities.emitEvent(`${nameSpace}:sectionEnter`, {
            container: this.el,
            instance: this,
          });
        }
      } else if (this.lastScrollTop < start) {
        // Before the scroll region - reset to start
        if (this.settings.reverse) {
          // Reverse: start with last section visible
          scrollWrapper.style.transform = `translateX(-${distance}px)`;
        } else {
          // Normal: start with first section visible
          scrollWrapper.style.transform = "translateX(0)";
        }
      } else if (this.lastScrollTop > end) {
        // After the scroll region - lock to end
        if (this.settings.reverse) {
          // Reverse: end with first section visible
          scrollWrapper.style.transform = "translateX(0)";
        } else {
          // Normal: end with last section visible
          scrollWrapper.style.transform = `translateX(-${distance}px)`;
        }

        // Emit section leave event
        if (this.lastScrollTop - 1 <= end) {
          Utilities.emitEvent(`${nameSpace}:sectionLeave`, {
            container: this.el,
            instance: this,
          });
        }
      }
    }

    /**
     * Add resize event listener to recalculate measurements
     */
    addResizeEventListener() {
      window.addEventListener("resize", () => {
        // Only recalculate if width actually changed (not just height/mobile scroll)
        if (window.innerWidth !== this.prevWidth) {
          this.updateMeasurements();
          this.prevWidth = window.innerWidth;
        }
      });
    }

    /**
     * Add click event listener for hash link navigation within horizontal sections
     */
    addClickEventListener() {
      document.addEventListener("click", event => {
        const link = event.target.closest("a");
        if (!link) return;

        const href = link.getAttribute("href");
        if (!href || !href.startsWith("#")) return;

        // Check if the target is within our horizontal sections
        const targetSection = document.querySelector(href)?.closest(".wm-hs-section");
        if (targetSection && this.horizontalGroup.scrollWrapper.contains(targetSection)) {
          event.preventDefault();
          event.stopPropagation();

          // Scroll to the position that would show this horizontal section
          window.scrollTo({
            top: this.horizontalGroup.container.offsetTop + targetSection.offsetLeft,
            behavior: "smooth",
          });
        }
      });
    }

    /**
     * Handle initial page load with hash in URL
     */
    handleHashNavigation() {
      const hash = window.location.hash;
      if (!hash) return;

      const targetSection = document.querySelector(hash)?.closest(".wm-hs-section");
      if (targetSection && this.horizontalGroup.scrollWrapper.contains(targetSection)) {
        // Disable scroll restoration to prevent browser from fighting us
        if ("scrollRestoration" in history) {
          history.scrollRestoration = "manual";
        }

        // Scroll to the correct position instantly
        window.scrollTo({
          top: this.horizontalGroup.container.offsetTop + targetSection.offsetLeft,
          behavior: "instant",
        });
      }
    }

    /**
     * Calculate and update all scroll measurements
     */
    updateMeasurements() {
      const { container, scrollWrapper } = this.horizontalGroup;
      if (!container || !scrollWrapper) return;

      // Calculate how far we need to scroll horizontally
      this.horizontalGroup.distance = scrollWrapper.offsetWidth - window.innerWidth;

      // Set CSS variable for container height
      // Height = viewport height + horizontal distance (so we have room to scroll)
      const totalHeight = window.innerHeight + this.horizontalGroup.distance;
      container.style.setProperty("--horizontal-sliding-height", `${totalHeight}px`);

      // Calculate start and end points for the scroll region
      // Start is offset by overlap to create smooth transition
      this.horizontalGroup.start = container.offsetTop - window.innerHeight * this.settings.overlapStart;

      // End point includes overlap on both sides
      this.horizontalGroup.end =
        this.horizontalGroup.start + this.horizontalGroup.distance + window.innerHeight * this.settings.overlapEnd * 2;

      // Set initial transform based on reverse setting and current scroll position
      if (this.settings.reverse && this.lastScrollTop < this.horizontalGroup.start) {
        scrollWrapper.style.transform = `translateX(-${this.horizontalGroup.distance}px)`;
      }
    }

    /**
     * Destroy this instance and restore original structure
     */
    destroy() {
      const { container, scrollWrapper } = this.horizontalGroup;
      if (!container) return;

      // Get all the horizontal sections
      const horizontalSections = Array.from(scrollWrapper.querySelectorAll(".wm-hs-section"));

      // Restore them to their original positions in reverse order
      horizontalSections.reverse().forEach(section => {
        section.classList.remove("wm-hs-section");
        container.insertAdjacentElement("afterend", section);
      });

      // Remove the horizontal container
      container.remove();
    }
  }

  // ============================================================================
  // PLUGIN INITIALIZATION
  // ============================================================================

  /**
   * Build the horizontal scroll structure from a plugin div
   * @param {Element} pluginEl - The element with data-wm-plugin="horizontal-scrolling-sections"
   * @param {Object} settings - Plugin settings
   * @returns {Element} - The created horizontal scroll container
   */
  function buildPlugin(pluginEl, settings) {
    // Get data attributes from the plugin element
    const data = pluginEl.dataset;
    const sectionCount = Utilities.parseAttributeValue(data.sectionCount) || 3;
    const overlap = Utilities.parseAttributeValue(data.overlap) ?? settings.overlap;
    const overlapStart = Utilities.parseAttributeValue(data.overlapStart) ?? overlap;
    const overlapEnd = Utilities.parseAttributeValue(data.overlapEnd) ?? overlap;
    const reverse = Utilities.parseAttributeValue(data.reverse) ?? settings.reverse;
    const id = pluginEl.id;

    // Find the parent section (this is where the horizontal scroll starts)
    const initialSection = pluginEl.closest(".page-section");
    if (!initialSection) {
      console.error("[Horizontal Scrolling] Plugin element must be inside a .page-section");
      return null;
    }

    // Get the color theme from the initial section
    const colorTheme = initialSection.dataset.sectionTheme;

    // Create the horizontal scroll container
    const horizontalContainer = document.createElement("section");
    horizontalContainer.classList.add("wm-hs-container", "page-section");
    if (id) horizontalContainer.id = id;
    if (colorTheme) horizontalContainer.dataset.sectionTheme = colorTheme;

    // Set the section count CSS variable
    horizontalContainer.style.setProperty("--section-count", sectionCount);

    // Store overlap settings as data attributes for the instance to read
    horizontalContainer.dataset.overlapStart = overlapStart;
    horizontalContainer.dataset.overlapEnd = overlapEnd;
    horizontalContainer.dataset.reverse = reverse;

    // Create the sticky wrapper (sticks during scroll)
    const stickyWrapper = document.createElement("div");
    stickyWrapper.classList.add("wm-hs-sticky-wrapper");

    // Create the scroll wrapper (contains all horizontal sections)
    const scrollWrapper = document.createElement("div");
    scrollWrapper.classList.add("wm-hs-scroll-wrapper");

    // Collect the sections to make horizontal
    let nextSection = initialSection;
    const sectionsToMove = [];

    for (let i = 0; i < sectionCount; i++) {
      if (!nextSection) {
        console.warn(`[Horizontal Scrolling] Only found ${i} sections, expected ${sectionCount}`);
        break;
      }

      sectionsToMove.push(nextSection);
      nextSection = nextSection.nextElementSibling;
    }

    // Assemble the structure first
    stickyWrapper.appendChild(scrollWrapper);
    horizontalContainer.appendChild(stickyWrapper);

    // Insert the horizontal container where the first section was
    // Do this BEFORE moving sections to avoid the hierarchy error
    initialSection.parentNode.insertBefore(horizontalContainer, sectionsToMove[0]);

    // Now move sections into the scroll wrapper
    sectionsToMove.forEach(section => {
      section.classList.add("wm-hs-section");
      scrollWrapper.appendChild(section);
    });

    return horizontalContainer;
  }

  /**
   * Initialize all plugin instances on the page
   */
  function initPlugin() {
    // Find all plugin trigger elements that haven't been initialized yet
    const pluginEls = document.querySelectorAll('[data-wm-plugin="horizontal-scrolling-sections"]:not([data-loading-state])');

    if (!pluginEls.length) return;

    const settings = window[nameSpace].settings;

    pluginEls.forEach(pluginEl => {
      // Skip if in edit mode or already inside a horizontal container
      if (pluginEl.closest("body.sqs-edit-mode-active") || pluginEl.closest(".wm-hs-container")) {
        return;
      }

      // Mark as initializing
      pluginEl.setAttribute("data-loading-state", "initializing");

      // Build the horizontal structure
      const horizontalContainer = buildPlugin(pluginEl, settings);

      if (!horizontalContainer) {
        pluginEl.setAttribute("data-loading-state", "error");
        return;
      }

      // Read overlap settings from the container
      const overlapStart = parseFloat(horizontalContainer.dataset.overlapStart) || settings.overlap;
      const overlapEnd = parseFloat(horizontalContainer.dataset.overlapEnd) || settings.overlap;
      const reverse = horizontalContainer.dataset.reverse === "true";

      // Create instance with custom overlap settings
      const instanceSettings = {
        ...settings,
        overlapStart,
        overlapEnd,
        reverse,
      };

      // Create the class instance
      const instance = new WMHorizontalScrolling(horizontalContainer, pluginEl, instanceSettings);

      // Store reference on the plugin element
      pluginEl.wmHorizontalScrolling = instance;
      pluginEl.setAttribute("data-loading-state", "initialized");

      // Add to global items array
      window[nameSpace].items.push({
        container: horizontalContainer,
        pluginEl: pluginEl,
        instance: instance,
      });
    });

    // Emit ready event after all instances are initialized
    if (pluginEls.length > 0) {
      Utilities.emitEvent(`${nameSpace}:ready`, {
        count: pluginEls.length,
      });
    }
  }

  /**
   * Deconstruct all horizontal scroll instances (used when entering edit mode)
   */
  function deconstruct() {
    const items = window[nameSpace].items;

    items.forEach(item => {
      if (item.instance && typeof item.instance.destroy === "function") {
        item.instance.destroy();
      }
    });

    // Clear the items array
    window[nameSpace].items = [];
  }

  /**
   * Listen for edit mode and deconstruct when it activates
   */
  function addDeconstructListener() {
    const bodyObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === "class") {
          if (document.body.classList.contains("sqs-edit-mode-active")) {
            deconstruct();
            bodyObserver.disconnect();
          }
        }
      });
    });

    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  // ============================================================================
  // PLUGIN SETUP & INITIALIZATION
  // ============================================================================

  const nameSpace = "wmHorizontalScrolling";

  // Default settings (can be overridden via window.wmHorizontalScrollingSettings)
  const defaultSettings = {
    overlap: 0, // Default overlap percentage (15% of viewport height)
    reverse: false, // Reverse scroll direction (right to left instead of left to right)
  };

  // Merge user settings if they exist
  const userSettings = window.wmHorizontalScrollingSettings || {};

  // Expose plugin API on window
  window[nameSpace] = {
    /**
     * Initialize the plugin
     */
    init: () => {
      initPlugin();
    },

    /**
     * Array to store all instances
     */
    items: [],

    /**
     * Merged settings
     */
    settings: Utilities.deepMerger({}, defaultSettings, userSettings),

    /**
     * Expose utilities
     */
    utilities: Utilities,

    /**
     * Expose deconstruct function
     */
    deconstruct: deconstruct,
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => {
      window[nameSpace].init();
      // Only add deconstruct listener if we're in an iframe (edit mode detection)
      if (window.self !== window.top) addDeconstructListener();
    });
  } else {
    // DOM is already ready
    window[nameSpace].init();
    if (window.self !== window.top) addDeconstructListener();
  }
})();