(function(){
  "use strict";
  if(!("IntersectionObserver" in window))return;
  if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  function init(){
    var sel="section h2,.card,.faq-item,.stat,.step,.cred,.cta-box,.panel,.tp-card,.price-card,.ftl-card,.tool-card,.related a";
    var els=document.querySelectorAll(sel);
    if(!els.length)return;
    var fold=window.innerHeight*.88;
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){en.target.classList.add("sa-in");obs.unobserve(en.target);}
      });
    },{threshold:.06,rootMargin:"0px 0px -6% 0px"});
    var groups=new Map();
    els.forEach(function(el){
      if(el.closest(".sa-reveal"))return;
      var r=el.getBoundingClientRect();
      // never hide content already on screen or not rendered (display:none)
      if(r.top<=fold||r.height===0)return;
      var idx=groups.get(el.parentElement)||0;
      groups.set(el.parentElement,idx+1);
      el.classList.add("sa-reveal");
      el.style.transitionDelay=(Math.min(idx,6)*.07).toFixed(2)+"s";
      obs.observe(el);
    });
    var counters=document.querySelectorAll("[data-count]");
    if(counters.length&&!document.body.classList.contains("js-ready")){
      var cObs=new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(!en.isIntersecting)return;
          cObs.unobserve(en.target);
          var el=en.target,target=parseFloat(el.getAttribute("data-count"));
          if(isNaN(target))return;
          var dec=parseInt(el.getAttribute("data-decimals")||"0",10);
          var suf=el.hasAttribute("data-suffix")?el.getAttribute("data-suffix"):"+";
          var n=0,step=target/Math.ceil(2200/32);
          var iv=setInterval(function(){
            n+=step;
            if(n>=target){clearInterval(iv);el.textContent=target.toFixed(dec)+suf;}
            else el.textContent=n.toFixed(dec)+suf;
          },32);
        });
      },{threshold:.4});
      counters.forEach(function(el){cObs.observe(el);});
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
})();
