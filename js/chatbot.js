(function () {
  "use strict";

  var fab = document.getElementById("chatFab");
  var widget = document.getElementById("chatWidget");
  var closeBtn = document.getElementById("chatClose");
  var body = document.getElementById("chatBody");
  var quickWrap = document.getElementById("chatQuick");
  var input = document.getElementById("chatInput");
  var sendBtn = document.getElementById("chatSend");
  if (!fab || !widget) return;

  var KB = [
    {
      label: "Delivery",
      keywords: ["deliver", "delivery", "same day", "same-day", "when will", "arrive", "arriving", "time", "fast", "urgent", "shipping", "dispatch", "reach"],
      reply: "We hand-deliver gifts the same day across Delhi NCR when you order before 5 PM. At checkout you enter the recipient's address, and our team calls to confirm the delivery slot before handing over the gift.",
      link: { url: "gift-delivery-delhi.html", text: "Delivery in Delhi" }
    },
    {
      label: "Payment",
      keywords: ["pay", "payment", "card", "upi", "cod", "cash", "visa", "mastercard", "amex", "international card", "bank", "debit", "credit"],
      reply: "You can pay by international debit or credit cards (Visa, Mastercard, Amex), UPI or UPI QR. No local Indian account is needed — even when ordering from abroad.",
      link: { url: "send-gifts-to-india.html", text: "Send Gifts to India" }
    },
    {
      label: "Rakhi Gifts",
      keywords: ["rakhi", "rakha", "raksha", "bandhan", "rakhri", "brother", "sister", "bhai", "behen"],
      reply: "We have rakhi combos, teddy bears, flowers, cakes and gift sets with same-day delivery in Delhi NCR. Explore our Rakhi gifts for the ones you love.",
      link: { url: "rakhi-gifts.html", text: "Rakhi Gift Ideas" }
    },
    {
      label: "Send from Abroad",
      keywords: ["nri", "abroad", "overseas", "foreign", "international", "from the us", "from usa", "from uk", "from canada", "from australia", "from africa", "america", "europe", "india from"],
      reply: "You can send gifts to India from the USA, UK, Europe, Canada, Australia and Africa. Order online, pay with your international card, and we hand-deliver the gift the same day in Delhi NCR with your personalised note.",
      link: { url: "send-gifts-to-india.html", text: "Send Gifts to India" }
    },
    {
      label: "Occasions",
      keywords: ["occasion", "birthday", "anniversary", "wedding", "housewarming", "baby shower", "baby-shower", "corporate", "celebration", "greeting"],
      reply: "We have dedicated occasion pages with handpicked gifts: birthday, anniversary, wedding, housewarming, baby shower and corporate gifting — all with same-day delivery.",
      link: { url: "occasion-gifts.html", text: "Occasion Gifts" }
    },
    {
      label: "Products",
      keywords: ["product", "gift", "buy", "order", "category", "catalogue", "what do you sell", "clothes", "cake", "teddy", "flower", "plant", "shoe", "sunglass", "belt", "cap", "toy", "combo"],
      reply: "We offer clothes, shoes, teddy bears, sunglasses, caps, belts, flowers, plants, cakes, toys and combo offers — most gifts under Rs 2,999 with same-day delivery in Delhi NCR.",
      link: { url: "index.html#shop", text: "Shop Now" }
    },
    {
      label: "Prices",
      keywords: ["price", "cost", "cheap", "expensive", "budget", "rs", "inr", "rupees", "how much", "rate"],
      reply: "Gifts range from around Rs 399 to Rs 2,999, shown in Indian Rupees at checkout."
    },
    {
      label: "Message on Gift",
      keywords: ["note", "message", "card", "personalise", "personalize", "personalised", "personalized", "custom", "wish", "write"],
      reply: "Every gift is delivered with a personalised card carrying your message. Just add your note at checkout and we'll print it on the card for the recipient."
    },
    {
      label: "Offers",
      keywords: ["offer", "discount", "code", "coupon", "sale", "deal", "promo", "off", "percent"],
      reply: "Check the special offers page for the latest deals and discounts.",
      link: { url: "special-offers.html", text: "Special Offers" }
    },
    {
      label: "Festivals",
      keywords: ["festival", "diwali", "holi", "christmas", "new year", "pongal", "eid", "dussehra", "dusshera", "rakhi offer"],
      reply: "We celebrate every festival! We currently have a special Raksha Bandhan offer running. Explore festival gifts for the ones you love.",
      link: { url: "festival.html", text: "Festival Offer" }
    },
    {
      label: "Track Order",
      keywords: ["status", "track", "tracking", "order", "confirm", "delivered yet", "dispatched", "my order"],
      reply: "After you place an order, we call the recipient to confirm the delivery time and then send you the update. For any order query, reach us on the contact page.",
      link: { url: "contact.html", text: "Contact Us" }
    },
    {
      label: "Returns",
      keywords: ["return", "cancel", "refund", "replace", "damaged", "wrong", "replacement"],
      reply: "If your gift arrives damaged or incorrect, contact us within 24 hours and we'll make it right with a replacement or refund.",
      link: { url: "contact.html", text: "Contact Us" }
    },
    {
      label: "Become a Vendor",
      keywords: ["vendor", "sell", "partner", "tie up", "seller", "supplier"],
      reply: "We'd love to have you as a vendor partner. Visit the vendor page for details on partnering with Giftora.",
      link: { url: "vendors.html", text: "Become a Vendor" }
    },
    {
      label: "Contact",
      keywords: ["contact", "phone", "call", "email", "talk", "support", "agent", "human", "reach", "whatsapp"],
      reply: "Our gift experts are happy to help — reach us through the contact page and we'll reply within a few hours.",
      link: { url: "contact.html", text: "Contact Us" }
    },
    {
      label: "Thank You",
      keywords: ["thank", "thanks", "great", "awesome", "nice", "love", "helpful", "good bot"],
      reply: "You're most welcome! Happy gifting — is there anything else I can help you with?"
    },
    {
      label: "Goodbye",
      keywords: ["bye", "goodbye", "see you", "later", "tata"],
      reply: "Goodbye! Have a wonderful day and happy gifting with Giftora."
    }
  ];

  var QUICK = ["Delivery", "Payment", "Rakhi Gifts", "Send from Abroad", "Occasions", "Offers"];

  var FALLBACK = "I'm not sure about that one yet. Try asking about delivery, payment, rakhi gifts, sending gifts from abroad, occasions or offers — or reach us on the contact page.";

  var GREETING = "Hi! I'm Giftora's assistant. Ask me about delivery, payment, rakhi gifts, sending gifts from abroad, or tap a suggestion below to get started.";

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function addMessage(text, who) {
    var wrap = document.createElement("div");
    wrap.className = "chat-msg " + (who === "user" ? "user" : "bot");
    var bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.innerHTML = escapeHtml(text);
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function showTyping() {
    var wrap = document.createElement("div");
    wrap.className = "chat-msg bot typing";
    wrap.innerHTML = '<div class="chat-bubble"><span></span><span></span><span></span></div>';
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function replyFor(text) {
    var q = text.toLowerCase();
    var best = null;
    var bestScore = 0;
    KB.forEach(function (item) {
      var score = 0;
      item.keywords.forEach(function (kw) {
        if (q.indexOf(kw) !== -1) score += kw.indexOf(" ") === -1 ? 1 : 2;
      });
      if (score > bestScore) { bestScore = score; best = item; }
    });
    if (!best) return { text: FALLBACK, link: null };
    return { text: best.reply, link: best.link || null };
  }

  function renderQuick() {
    if (!quickWrap) return;
    quickWrap.innerHTML = "";
    QUICK.forEach(function (label) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chat-chip";
      chip.textContent = label;
      chip.addEventListener("click", function () {
        sendMessage(label);
      });
      quickWrap.appendChild(chip);
    });
  }

  function respond(text) {
    var typing = showTyping();
    setTimeout(function () {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      var r = replyFor(text);
      addMessage(r.text, "bot");
      if (r.link) {
        var linkWrap = document.createElement("div");
        linkWrap.className = "chat-msg bot";
        var link = document.createElement("a");
        link.className = "chat-link";
        link.href = r.link.url;
        link.textContent = r.link.text;
        linkWrap.appendChild(link);
        body.appendChild(linkWrap);
        body.scrollTop = body.scrollHeight;
      }
    }, 700);
  }

  function sendMessage(text) {
    var value = (text || input.value).trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";
    respond(value);
  }

  function open() {
    widget.classList.add("open");
    widget.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    fab.classList.add("active");
    if (!body.children.length) {
      addMessage(GREETING, "bot");
      renderQuick();
    }
    setTimeout(function () { if (input) input.focus(); }, 200);
  }

  function close() {
    widget.classList.remove("open");
    widget.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
    fab.classList.remove("active");
  }

  fab.addEventListener("click", function () {
    if (widget.classList.contains("open")) close(); else open();
  });

  if (closeBtn) closeBtn.addEventListener("click", close);

  if (sendBtn) sendBtn.addEventListener("click", function () { sendMessage(); });

  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") sendMessage();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && widget.classList.contains("open")) close();
  });
})();
