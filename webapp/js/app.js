requirejs.config({
    baseUrl: 'js',
    paths: {
        'draw': '../libs/leaflet.draw',
        'templates': '../templates', 
        'text': '../libs/plugins/text'
    }
});

requirejs(['app/config','app/state', 'app/templates',
           'app/helpers', 'app/view_helpers'],
function(config, state, templates, helpers, view_helpers) {
  $(function() {
    "use strict";
    //JET: Load sections
    $.get("data/comunas.json", function(comunas) {
      config.distritos = comunas;
      //JET: Load parties dictionary 
      $.get("data/diccionario_partidos.json", function(data){
        config.dicc_partidos = data;
      });
    });

    config.ancho = $(window).width();
    config.alto = $(window).height();

    $(window).resize(function() {
        config.ancho = $(window).width();
        config.alto = $(window).height();
    });

    state.map = L.map('mapa_cont', {
        center: [-34.61597432902992, -58.442115783691406],
        zoom: 12,
        minZoom: 12,
        maxZoom: 16,
        attributionControl: false
    });

    var mapboxUrl = config.cdn_proxy+'https://{s}.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={token}';
    //L.tileLayer(mapboxUrl, {attribution: "OpenStreetMaps"}).addTo(state.map);
    L.tileLayer(mapboxUrl, {
                            id: 'olcreativa.c409ba3f', 
                            attribution: "OpenStreetMaps", 
                            token: 'pk.eyJ1Ijoib2xjcmVhdGl2YSIsImEiOiJEZWUxUmpzIn0.buFJd1-sVkgR01epcQz4Iw'}).addTo(state.map);

    //JET: compile template for the description of a given polling station
    var popup_tmpl = _.template(templates.popup);
    //JET: compile template for the results of a given polling station
    //var overlay_tmpl = Handlebars.compile(templates.overlay);
    var overlay_tmpl = _.template(templates.overlay);
    //JET: Keep state

    config.sql = new cartodb.SQL({
        user: config.CARTODB_USER
    });

    var FEATURE_CLICK_SQL_TMPL = _.template(templates.feature_click_sql);

    var CARTOCSS_TMPL = _.template(templates.cartocss);

    //JET: sharing
    $("a#google").click(function(){
        window.open( config.google_url, "Compartir", "status = yes, height = 360, width = 500, resizable = yes, left = "+(config.ancho/2+250)+", top =" +(config.alto/2-150) );
        return false;
    });

    $("a#twit").click(function(){
        window.open( config.twitter_url, "Compartir", "status = yes, height = 360, width = 500, resizable = yes, left = "+(config.ancho/2+250)+", top =" +(config.alto/2-150) );
        return false;
    });

    $("a#facebook").click(function(){
        window.open( config.facebook_url, "Compartir", "status = yes, height = 360, width = 500, resizable = yes, left = "+(config.ancho/2+250)+", top =" +(config.alto/2-150) );
        return false;
    });

    //JET: credits
    $('.creVent').html(_.template(templates.credits));

    //JET: hide overlay by shifting to the left with animation
    var hideOverlay = function() {
        $('#overlay').css('left', '100%');
    };
    //JET: show overlay by shifting to the left with animation
    var showOverlay = function() {
        $('#overlay').css('left', '73%');
    };

    $(".creditos").click(function(){
       $(".creVent").fadeIn(200);
       $(".creVent .txts").delay(300).fadeIn(200);
    });

    $(".cerrar").click(function(){
       $(".creVent .txts").fadeOut(200);
       $(".creVent").delay(300).fadeOut(200);
    });

    //JET: If we move the map manually and the overlay falls out of bounds hide overlay
    state.map.on('dragend', function(e, x, y) {
        if (state.current_ltlng !== null && !state.map.getBounds().contains(state.current_ltlng)) {
            hideOverlay();
            state.map.closePopup();
        }
    });

    //JET: Close pop up and political party viz
    state.map.on('popupclose', function() {
        if (state.featureClicked) state.featureClicked = false;
        helpers.close_slide();
    });

    //JET: if we are over a polling station change cursor to pointer
    var featureOver = function(e, latlng, pos, data, layerNumber) {
        $('#mapa_cont').css('cursor', 'pointer');
    };

    //JET: reset when we are not over a polling station
    var featureOut = function(e, layer) {
        $('#mapa_cont').css('cursor', 'auto');
    };


    //JET: Called when the Cartodb SQL has finished
    var featureClickDone = function(latlng, establecimiento_data, votos_data) {
        var popup = L.popup()
            .setLatLng(latlng)
            .setContent(popup_tmpl({establecimiento: establecimiento_data,
                                    distritos: config.distritos,
                                    v: votos_data,
                                    dict_partidos: config.dicc_partidos}))
            .openOn(state.map);

        var d = votos_data.rows;
        d.forEach(function(d) {
            d.pct = (d.votos / establecimiento_data.positivos) * 100;
        });
        $('#results').html(overlay_tmpl({
            e: establecimiento_data,
            data: d,
            dict_partidos: config.dicc_partidos,
            max: _.max(d, function(item){ return item.votos; }),
            vh: view_helpers
        }));

        $("#results a.cerrar").click(function(){
            helpers.close_slide();
        });

        $('#results').animate({right:'0%'}, 'fast', function(){
            helpers.animate_barras();
        });

        location.hash = establecimiento_data.id_establecimiento;
    };

    //JET: 
    var featureClick = function(event, latlng, pos, establecimiento_data, layerIndex) {
        //JET: 
        $('#overlay *').fadeOut(200, function() { $(this).remove();});
        showOverlay();
        state.current_ltlng = latlng;
        //JET: It seems that the decision was to not center the map on each click when interacting
        // with the map itself
        state.map.panTo(latlng);
        setTimeout(function() {
            //TODO: Couldn't this be done in a single step?
            var query = FEATURE_CLICK_SQL_TMPL({
                establecimiento: establecimiento_data
            });
            config.sql.execute(query, establecimiento_data)
                //JET: partially apply a function http://underscorejs.org/#partial
                .done(_.partial(featureClickDone, latlng, establecimiento_data))
                .error(function(errors) {
                  // errors contains a list of errors
                });
        }, 200);
    };

    //JET: Creating viz at runtime
    //http://docs.cartodb.com/cartodb-platform/cartodb-js.html#creating-visualizations-at-runtime
    cartodb.createLayer(state.map, {
         user_name: config.CARTODB_USER,
         type: 'cartodb',
         sublayers: [{
             sql: config.LAYER_SQL,
             //JET: Use the cartocss underscore template and pass it to the layer
             cartocss: CARTOCSS_TMPL({ colores: config.PARTIDOS_COLORES }),
             interactivity: 'id_establecimiento, nombre, direccion,  id_distrito, id_seccion, \
                            electores, votantes, positivos, id_partido, votos, \
                            margin_victory, sqrt_positivos',
         }]
     })
      .addTo(state.map)
      .on('done', function(layer) {
          config.carto_layers['2015_caba_paso'] = layer;
          layer.setInteraction(true);
          layer.on('featureOver', featureOver)
              .on('featureOut', featureOut)
              .on('featureClick', featureClick);
        
        if(helpers.check_location()){
            var id_establecimiento = helpers.check_location().replace("#", "");
            config.sql.execute(templates.permalink_sql,{id_establecimiento: id_establecimiento})
            .done(function(data) {
                var position = JSON.parse(data.rows[0].g).coordinates;
                var latlng = L.latLng(position[1], position[0]);
                var d = data.rows[0];
                state.map.setView(latlng, 14);
                featureClick(null, latlng, state.map.latLngToLayerPoint(latlng), d, 0);
            });
        }
        
      })
      .on('error', function(err) {
          console.log(err);
      });
  });
});
