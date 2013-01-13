//Request Animation Frame polyfill
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
            || window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
                timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };

    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());


$(function(){

    var N           = $('#input_number').val();
    var collisions  = $('#collisions').is(':checked');
    var vf_key      = $('#vf_select').val();
    var drag        = $('#input_drag').val();

    var restitution = 1;
    var friction    = 1;

    var vf          = vectorFields[vf_key];
    var vectorField = new VectorField(vf);

    var initialEnergy = 0;
    var output = false;

    vectorField.draw();

    //populate vector field dropdown selection
    var integrationTypes = ['symplectic euler', 'forward euler', 'verlet'];
    var integrationType = integrationTypes[1];
    for (var key in integrationTypes){
        var selection = $('<option>').attr('value',integrationTypes[key]).html(integrationTypes[key]);
        $('#integrator_select').append(selection);
    }


    //------------------------------------------HTML event listeners

    $('#vf_select').on('change',function(){
        vf_key = $(this).val();
        vf = vectorFields[vf_key];

        vectorField = new VectorField(vf);
        vectorField.draw();
    });

    $('#collisions').on('change',function(){
        collisions = $(this).is(':checked');
    });

    $('#input_drag').on('change',function(){
        drag = parseFloat($(this).val());
        $('#value_drag').html(drag);
    });

    $('#input_integrator').on('change',function(){
        integrationType = $(this).val();
    });


    $('#input_number').on('change',function(){
        var number = parseInt($(this).val());
        $('#value_number').html(number);
    });

    $('#reset').on('click',function(){
        resetSimulation();
    });

    //------------------------------------------World Parameters

    var $world = $('#world');   //DOM world
    var $fps = $('#fps');       //DOM frames per second
    var particles = [];         //array of all particles

    //World dimensions from CSS
    var worldTop = 0;
    var worldLeft = 0;
    var worldWidth = $world.width();
    var worldHeight = $world.height();

    //Wall normals
    var n_wallLeft   = new Vector2( 1,  0);
    var n_wallRight  = new Vector2(-1,  0);
    var n_wallTop    = new Vector2( 0, -1);
    var n_wallBottom = new Vector2( 0,  1);

    //Particle constructor
    function Circle(options){

        options = options || {};

        //---------------------------------------Attributes

        //defaults
        this.index = options.index || 0;
        this.r = options.r || 20;
        this.m = options.m || this.r/8;
        this.p = options.p || new Vector2(0, 0);
        this.v = options.v || new Vector2(0, 0);
        this.a = options.a || new Vector2(0, 0);
        this.pOld = this.p;

        this.$el = $('<div>')
            .addClass('circle')
            .attr('id', this.index + '')
            .css({
                'left' : this.p[0],
                'top'  : this.p[1],
                'height' : 2*this.r,
                'width' : 2*this.r,
                'border-radius' : this.r
            });

        //---------------------------------------Methods

        //update called on each loop iteration. delta is difference in time from previous iteration
        this.update = function(delta){

            //TODO: refactor this into a dropdown for the user to choose integration type

            var dt = delta * 60/1000;

            var force_vf = vectorField.eval(this.p.x,this.p.y);
            var force_friction = this.v.mult(-drag);

            switch (integrationType){

                case 'forward euler':

                    this.a = force_vf.add(force_friction).div(this.m);
                    this.p = this.p.add(this.v.mult(dt));
                    this.v = this.v.add(this.a.mult(dt));
                    break;

                case 'symplectic euler':

                    this.a = force_vf.add(force_friction).div(this.m);
                    this.v = this.v.add(this.a.mult(dt));
                    this.p = this.p.add(this.v.mult(dt));
                    break;

                case 'verlet':

                    this.v = this.p.sub(this.pOld);
                    force_friction = this.v.mult(-drag);
                    var dp = this.p.sub(this.pOld).add((force_vf.add(force_friction)).mult(dt*dt));
                    this.pOld = new Vector2(this.p.x, this.p.y);
                    this.p.addFrom(dp);
                    break;

            }

        };

        //draw to world
        this.draw = function(){
            this.$el.css({
                'left' : this.p.x,
                'top' : this.p.y
            });
        };

        //add to world
        this.append = function(){
            $world.append(this.$el);
            particles.push(this)
        };

        this.remove = function(){
            this.$el.remove();
            //var index = particles.indexOf(this);
            //particles.splice(index,1);
        };

        //hack to ensure particles in world after simultaneous collisions
        this.containInWorld = function(worldWidth,worldHeight){

            if (this.p.x <= 0)
                this.p.x = 0;

            if (this.p.x + 2 * this.r >= worldWidth)
                this.p.x = worldWidth - 2 * this.r;

            if (this.p.y - 2 * this.r <= 0)
                this.p.y = 2 * this.r;

            if (this.p.y >= worldHeight)
                this.p.y = worldHeight;

        };

        //return collision types
        this.collision = function(){

            var radius = this.r;
            var type = '';
            var extras = {};

            //inter particle collisions
            if (collisions){
                for (var index in particles){

                    var particle = particles[index];
                    if (this.index < particle.index){

                        var dir = this.p.sub(particle.p);
                        var dist = dir.norm();
                        var n = dir.normalize();

                        if (dist < this.r + particle.r){
                            type += 'collision ';
                            extras = {
                                dir : dir,
                                n : n,
                                particle : particle
                            }
                        }
                    }

                }
            }

            //wall collision
            if (this.p.y + 2*radius >= worldHeight && this.v.dot(n_wallBottom) >= 0)
                type += 'floor ';

            if (this.p.y <= worldTop && this.v.dot(n_wallTop) >= 0)
                type += 'ceiling ';

            if (this.p.x <= worldLeft)
                type += 'left ';

            if (this.p.x + 2*radius >= worldWidth)
                type += 'right ';

            return {
                type : type,
                extras : extras
            };

        };

        //update position and velocity post collision
        this.collisionUpdate = function(params){

            var radius = this.r;
            var typeArray = params.type.split(' ');
            var residue;

            for (var index in typeArray){

                switch (typeArray[index]){

                    case 'collision':

                        var n = params.extras.n;
                        var particle = params.extras.particle;

                        var dist = this.r + particle.r;
                        var dir = n.mult(dist);

                        var m1 = this.m;
                        var m2 = particle.m;

                        var v1 = this.v;
                        var v2 = particle.v;

                        var vRelative = v1.sub(v2);
                        var I = n.mult((1 + restitution) * vRelative.dot(n) * m1*m2/(m1 + m2));

                        this.v.subFrom(I.div(m1));
                        this.p = particle.p.add(dir);

                        particle.v.addFrom(I.div(m2));

                        break;

                    case 'floor':
                        // overshoot distance:
                        residue = this.p.y + 2*radius - worldHeight;
                        // Give a more natural 'bounce'
                        this.p.y -= Math.floor(2*residue);

                        this.v.reflect(n_wallBottom, restitution);
                        this.v.x *= friction;
                        //this.v.y *= -1;
                        break;

                    case 'ceiling':
                        residue = (worldTop - this.p.y);
                        this.p.y += Math.floor(2*residue);

                        this.v.reflect(n_wallTop, restitution);
                        this.v.x *= friction;
                        break;

                    case 'left':
                        residue = (worldLeft - this.p.x);
                        this.p.x += Math.floor(2*residue);

                        this.v.reflect(n_wallLeft, restitution);
                        this.v.y *= friction;
                        break;

                    case 'right':
                        residue = (this.p.x + 2*radius - worldWidth);
                        this.p.x -= Math.floor(2*residue);

                        this.v.reflect(n_wallRight, restitution);
                        this.v.y *= friction;
                        break;

                    default:

                }

            }

        };

    }

    function createParticles(){

        //create N particles with randomized attributes
        for (var i = 0; i < N; i++){

            new Circle({
                index : i,
                r : Math.ceil(10 * Math.random()),
                p : new Vector2(worldWidth * Math.random(), worldHeight * Math.random()),
                v : new Vector2(10 * (Math.random() - 0.5), 10 * (Math.random() - 0.5))
//                v : new Vector2(0,0)
            }).append();

        }
    }

    function destroyParticles(){

        //create N particles with randomized attributes
        for (var i = 0; i < N; i++){
            particles[i].remove();
        }
        particles = [];

    }

    function draw(){

        //create N particles with randomized attributes
        for (var i = 0; i < N; i++){
            particles[i].draw();
        }

    }

    function collisionResolution(){

        var numCollisions = 0;

        for (var i = 0; i < N; i++){
            var particle = particles[i]
            var collisionParams = particle.collision();
            if (collisionParams.type){
                numCollisions++;
                particle.collisionUpdate(collisionParams);
            }
        }

        return numCollisions;

    }

//    detect device rotation
//    if (window.DeviceOrientationEvent) {
//        window.addEventListener('deviceorientation', function(eventData) {
//            var tiltLR = eventData.gamma;
//            var tiltFB = eventData.beta;
//            onDeviceOrientationChange(tiltFB, tiltLR);
//        }, false);
//    }
//    else if (window.OrientationEvent) {
//        window.addEventListener('MozOrientation', function(eventData) {
//            var tiltLR = eventData.x * 90;
//            var tiltFB = eventData.y * -90;
//            onDeviceOrientationChange(tiltFB, tiltLR);
//        }, false);
//    }
//
//    //change direction of gravity
//    function onDeviceOrientationChange(tiltFB, tiltLR){
//
//        var angle, x, y;
//
//        if (Math.abs(tiltFB) <= 90){
//            angle = tiltLR;
//            x = gravity * Math.cos(Math.PI/2 - angle * Math.PI / 360);
//            y = gravity * Math.sin(Math.PI/2 - angle * Math.PI / 360);
//        } else {
//            angle = tiltLR;
//            x = gravity * Math.cos(Math.PI/2 - angle * Math.PI / 360);
//            y = - gravity * Math.sin(Math.PI/2 - angle * Math.PI / 360);
//        }
//
//        vGravity.set(x,y);
//
//    };

    //frame count
    var frames = 60;
    var fps_timeout;
    var totalFrames = 0;

    function fps(){

        fps_timeout = setTimeout(fps,1000);
        $fps.html(frames);
        frames = 0;

    }

    //outer loop
    var simulation;
    var now, delta;
    var then = new Date().getTime();

    function loop(){

        simulation = requestAnimationFrame(loop);

        now = new Date().getTime();
        delta = now - then;

        for (var index in particles)
            particles[index].update(delta);

        var numCollisions = collisionResolution();
        if (numCollisions/N > .5){
            collisionResolution();
        }

        draw();

        if (output){
            var worldKineticEnergy = totalKineticEnergy();

            if (totalFrames == 0)
                initialEnergy = worldKineticEnergy;

            // Percent Error only works for conservative vector fields (Potential energy not calculated yet):
            if (frames % 30 == 0) {
                var kineticEnergyError = (initialEnergy - worldKineticEnergy) / (initialEnergy);
                console.log("Total K.E.: %1.1f \tChange in K.E. from t=0: %.01f", worldKineticEnergy, kineticEnergyError);
            }
            totalFrames++;
        }

        then = now;
        frames++;

    }

    function resetSimulation(){

        cancelAnimationFrame(simulation);
        clearInterval(fps_timeout);

        destroyParticles();

        N = parseInt($('#input_number').val());
        createParticles();
        fps();
        loop();

    }

    function totalKineticEnergy() {
        var totalEnergy = 0;
        for (var index in particles){
            var particle = particles[index];
            totalEnergy += .5 * particle.m * particle.v.dot(particle.v);
        }

        return totalEnergy;
    }

    //run simulation
    createParticles();
    fps();
    loop();


});