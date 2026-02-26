import { Controls, Vector3, MOUSE, TOUCH, Quaternion, Spherical, Vector2, Ray, Plane, MathUtils, TrianglesDrawMode, TriangleFanDrawMode, TriangleStripDrawMode, Loader, LoaderUtils, FileLoader, MeshPhysicalMaterial, Color, LinearSRGBColorSpace, SRGBColorSpace, SpotLight, PointLight, DirectionalLight, Matrix4, InstancedMesh, InstancedBufferAttribute, Object3D, TextureLoader, ImageBitmapLoader, BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, LinearMipmapLinearFilter, NearestMipmapLinearFilter, LinearMipmapNearestFilter, NearestMipmapNearestFilter, LinearFilter, NearestFilter, RepeatWrapping, MirroredRepeatWrapping, ClampToEdgeWrapping, PointsMaterial, Material, LineBasicMaterial, MeshStandardMaterial, DoubleSide, MeshBasicMaterial, PropertyBinding, BufferGeometry, SkinnedMesh, Mesh, LineSegments, Line, LineLoop, Points, Group, PerspectiveCamera, OrthographicCamera, Skeleton, AnimationClip, Bone, InterpolateDiscrete, InterpolateLinear, Texture, VectorKeyframeTrack, NumberKeyframeTrack, QuaternionKeyframeTrack, ColorManagement, FrontSide, Interpolant, Box3, Sphere, Vector4, Curve, MeshPhongMaterial, MeshLambertMaterial, EquirectangularReflectionMapping, AmbientLight, Float32BufferAttribute, Uint16BufferAttribute, Matrix3, ShapeUtils, Euler, REVISION, CompressedTexture, Source, NoColorSpace, RGBAFormat, ImageUtils, Scene } from 'three';

/**
 * Fires when the camera has been transformed by the controls.
 *
 * @event OrbitControls#change
 * @type {Object}
 */
const _changeEvent = { type: 'change' };

/**
 * Fires when an interaction was initiated.
 *
 * @event OrbitControls#start
 * @type {Object}
 */
const _startEvent = { type: 'start' };

/**
 * Fires when an interaction has finished.
 *
 * @event OrbitControls#end
 * @type {Object}
 */
const _endEvent = { type: 'end' };

const _ray = new Ray();
const _plane = new Plane();
const _TILT_LIMIT = Math.cos( 70 * MathUtils.DEG2RAD );

const _v = new Vector3();
const _twoPI = 2 * Math.PI;

const _STATE = {
	NONE: -1,
	ROTATE: 0,
	DOLLY: 1,
	PAN: 2,
	TOUCH_ROTATE: 3,
	TOUCH_PAN: 4,
	TOUCH_DOLLY_PAN: 5,
	TOUCH_DOLLY_ROTATE: 6
};
const _EPS = 0.000001;


/**
 * Orbit controls allow the camera to orbit around a target.
 *
 * OrbitControls performs orbiting, dollying (zooming), and panning. Unlike {@link TrackballControls},
 * it maintains the "up" direction `object.up` (+Y by default).
 *
 * - Orbit: Left mouse / touch: one-finger move.
 * - Zoom: Middle mouse, or mousewheel / touch: two-finger spread or squish.
 * - Pan: Right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move.
 *
 * ```js
 * const controls = new OrbitControls( camera, renderer.domElement );
 *
 * // controls.update() must be called after any manual changes to the camera's transform
 * camera.position.set( 0, 20, 100 );
 * controls.update();
 *
 * function animate() {
 *
 * 	// required if controls.enableDamping or controls.autoRotate are set to true
 * 	controls.update();
 *
 * 	renderer.render( scene, camera );
 *
 * }
 * ```
 *
 * @augments Controls
 * @three_import import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
 */
class OrbitControls extends Controls {

	/**
	 * Constructs a new controls instance.
	 *
	 * @param {Object3D} object - The object that is managed by the controls.
	 * @param {?HTMLElement} domElement - The HTML element used for event listeners.
	 */
	constructor( object, domElement = null ) {

		super( object, domElement );

		this.state = _STATE.NONE;

		/**
		 * The focus point of the controls, the `object` orbits around this.
		 * It can be updated manually at any point to change the focus of the controls.
		 *
		 * @type {Vector3}
		 */
		this.target = new Vector3();

		/**
		 * The focus point of the `minTargetRadius` and `maxTargetRadius` limits.
		 * It can be updated manually at any point to change the center of interest
		 * for the `target`.
		 *
		 * @type {Vector3}
		 */
		this.cursor = new Vector3();

		/**
		 * How far you can dolly in (perspective camera only).
		 *
		 * @type {number}
		 * @default 0
		 */
		this.minDistance = 0;

		/**
		 * How far you can dolly out (perspective camera only).
		 *
		 * @type {number}
		 * @default Infinity
		 */
		this.maxDistance = Infinity;

		/**
		 * How far you can zoom in (orthographic camera only).
		 *
		 * @type {number}
		 * @default 0
		 */
		this.minZoom = 0;

		/**
		 * How far you can zoom out (orthographic camera only).
		 *
		 * @type {number}
		 * @default Infinity
		 */
		this.maxZoom = Infinity;

		/**
		 * How close you can get the target to the 3D `cursor`.
		 *
		 * @type {number}
		 * @default 0
		 */
		this.minTargetRadius = 0;

		/**
		 * How far you can move the target from the 3D `cursor`.
		 *
		 * @type {number}
		 * @default Infinity
		 */
		this.maxTargetRadius = Infinity;

		/**
		 * How far you can orbit vertically, lower limit. Range is `[0, Math.PI]` radians.
		 *
		 * @type {number}
		 * @default 0
		 */
		this.minPolarAngle = 0;

		/**
		 * How far you can orbit vertically, upper limit. Range is `[0, Math.PI]` radians.
		 *
		 * @type {number}
		 * @default Math.PI
		 */
		this.maxPolarAngle = Math.PI;

		/**
		 * How far you can orbit horizontally, lower limit. If set, the interval `[ min, max ]`
		 * must be a sub-interval of `[ - 2 PI, 2 PI ]`, with `( max - min < 2 PI )`.
		 *
		 * @type {number}
		 * @default -Infinity
		 */
		this.minAzimuthAngle = - Infinity;

		/**
		 * How far you can orbit horizontally, upper limit. If set, the interval `[ min, max ]`
		 * must be a sub-interval of `[ - 2 PI, 2 PI ]`, with `( max - min < 2 PI )`.
		 *
		 * @type {number}
		 * @default -Infinity
		 */
		this.maxAzimuthAngle = Infinity;

		/**
		 * Set to `true` to enable damping (inertia), which can be used to give a sense of weight
		 * to the controls. Note that if this is enabled, you must call `update()` in your animation
		 * loop.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.enableDamping = false;

		/**
		 * The damping inertia used if `enableDamping` is set to `true`.
		 *
		 * Note that for this to work, you must call `update()` in your animation loop.
		 *
		 * @type {number}
		 * @default 0.05
		 */
		this.dampingFactor = 0.05;

		/**
		 * Enable or disable zooming (dollying) of the camera.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.enableZoom = true;

		/**
		 * Speed of zooming / dollying.
		 *
		 * @type {number}
		 * @default 1
		 */
		this.zoomSpeed = 1.0;

		/**
		 * Enable or disable horizontal and vertical rotation of the camera.
		 *
		 * Note that it is possible to disable a single axis by setting the min and max of the
		 * `minPolarAngle` or `minAzimuthAngle` to the same value, which will cause the vertical
		 * or horizontal rotation to be fixed at that value.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.enableRotate = true;

		/**
		 * Speed of rotation.
		 *
		 * @type {number}
		 * @default 1
		 */
		this.rotateSpeed = 1.0;

		/**
		 * How fast to rotate the camera when the keyboard is used.
		 *
		 * @type {number}
		 * @default 1
		 */
		this.keyRotateSpeed = 1.0;

		/**
		 * Enable or disable camera panning.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.enablePan = true;

		/**
		 * Speed of panning.
		 *
		 * @type {number}
		 * @default 1
		 */
		this.panSpeed = 1.0;

		/**
		 * Defines how the camera's position is translated when panning. If `true`, the camera pans
		 * in screen space. Otherwise, the camera pans in the plane orthogonal to the camera's up
		 * direction.
		 *
		 * @type {boolean}
		 * @default true
		 */
		this.screenSpacePanning = true;

		/**
		 * How fast to pan the camera when the keyboard is used in
		 * pixels per keypress.
		 *
		 * @type {number}
		 * @default 7
		 */
		this.keyPanSpeed = 7.0;

		/**
		 * Setting this property to `true` allows to zoom to the cursor's position.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.zoomToCursor = false;

		/**
		 * Set to true to automatically rotate around the target
		 *
		 * Note that if this is enabled, you must call `update()` in your animation loop.
		 * If you want the auto-rotate speed to be independent of the frame rate (the refresh
		 * rate of the display), you must pass the time `deltaTime`, in seconds, to `update()`.
		 *
		 * @type {boolean}
		 * @default false
		 */
		this.autoRotate = false;

		/**
		 * How fast to rotate around the target if `autoRotate` is `true`. The default  equates to 30 seconds
		 * per orbit at 60fps.
		 *
		 * Note that if `autoRotate` is enabled, you must call `update()` in your animation loop.
		 *
		 * @type {number}
		 * @default 2
		 */
		this.autoRotateSpeed = 2.0;

		/**
		 * This object contains references to the keycodes for controlling camera panning.
		 *
		 * ```js
		 * controls.keys = {
		 * 	LEFT: 'ArrowLeft', //left arrow
		 * 	UP: 'ArrowUp', // up arrow
		 * 	RIGHT: 'ArrowRight', // right arrow
		 * 	BOTTOM: 'ArrowDown' // down arrow
		 * }
		 * ```
		 * @type {Object}
		 */
		this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

		/**
		 * This object contains references to the mouse actions used by the controls.
		 *
		 * ```js
		 * controls.mouseButtons = {
		 * 	LEFT: THREE.MOUSE.ROTATE,
		 * 	MIDDLE: THREE.MOUSE.DOLLY,
		 * 	RIGHT: THREE.MOUSE.PAN
		 * }
		 * ```
		 * @type {Object}
		 */
		this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };

		/**
		 * This object contains references to the touch actions used by the controls.
		 *
		 * ```js
		 * controls.mouseButtons = {
		 * 	ONE: THREE.TOUCH.ROTATE,
		 * 	TWO: THREE.TOUCH.DOLLY_PAN
		 * }
		 * ```
		 * @type {Object}
		 */
		this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

		/**
		 * Used internally by `saveState()` and `reset()`.
		 *
		 * @type {Vector3}
		 */
		this.target0 = this.target.clone();

		/**
		 * Used internally by `saveState()` and `reset()`.
		 *
		 * @type {Vector3}
		 */
		this.position0 = this.object.position.clone();

		/**
		 * Used internally by `saveState()` and `reset()`.
		 *
		 * @type {number}
		 */
		this.zoom0 = this.object.zoom;

		// the target DOM element for key events
		this._domElementKeyEvents = null;

		// internals

		this._lastPosition = new Vector3();
		this._lastQuaternion = new Quaternion();
		this._lastTargetPosition = new Vector3();

		// so camera.up is the orbit axis
		this._quat = new Quaternion().setFromUnitVectors( object.up, new Vector3( 0, 1, 0 ) );
		this._quatInverse = this._quat.clone().invert();

		// current position in spherical coordinates
		this._spherical = new Spherical();
		this._sphericalDelta = new Spherical();

		this._scale = 1;
		this._panOffset = new Vector3();

		this._rotateStart = new Vector2();
		this._rotateEnd = new Vector2();
		this._rotateDelta = new Vector2();

		this._panStart = new Vector2();
		this._panEnd = new Vector2();
		this._panDelta = new Vector2();

		this._dollyStart = new Vector2();
		this._dollyEnd = new Vector2();
		this._dollyDelta = new Vector2();

		this._dollyDirection = new Vector3();
		this._mouse = new Vector2();
		this._performCursorZoom = false;

		this._pointers = [];
		this._pointerPositions = {};

		this._controlActive = false;

		// event listeners

		this._onPointerMove = onPointerMove.bind( this );
		this._onPointerDown = onPointerDown.bind( this );
		this._onPointerUp = onPointerUp.bind( this );
		this._onContextMenu = onContextMenu.bind( this );
		this._onMouseWheel = onMouseWheel.bind( this );
		this._onKeyDown = onKeyDown.bind( this );

		this._onTouchStart = onTouchStart.bind( this );
		this._onTouchMove = onTouchMove.bind( this );

		this._onMouseDown = onMouseDown.bind( this );
		this._onMouseMove = onMouseMove.bind( this );

		this._interceptControlDown = interceptControlDown.bind( this );
		this._interceptControlUp = interceptControlUp.bind( this );

		//

		if ( this.domElement !== null ) {

			this.connect( this.domElement );

		}

		this.update();

	}

	connect( element ) {

		super.connect( element );

		this.domElement.addEventListener( 'pointerdown', this._onPointerDown );
		this.domElement.addEventListener( 'pointercancel', this._onPointerUp );

		this.domElement.addEventListener( 'contextmenu', this._onContextMenu );
		this.domElement.addEventListener( 'wheel', this._onMouseWheel, { passive: false } );

		const document = this.domElement.getRootNode(); // offscreen canvas compatibility
		document.addEventListener( 'keydown', this._interceptControlDown, { passive: true, capture: true } );

		this.domElement.style.touchAction = 'none'; // disable touch scroll

	}

	disconnect() {

		this.domElement.removeEventListener( 'pointerdown', this._onPointerDown );
		this.domElement.removeEventListener( 'pointermove', this._onPointerMove );
		this.domElement.removeEventListener( 'pointerup', this._onPointerUp );
		this.domElement.removeEventListener( 'pointercancel', this._onPointerUp );

		this.domElement.removeEventListener( 'wheel', this._onMouseWheel );
		this.domElement.removeEventListener( 'contextmenu', this._onContextMenu );

		this.stopListenToKeyEvents();

		const document = this.domElement.getRootNode(); // offscreen canvas compatibility
		document.removeEventListener( 'keydown', this._interceptControlDown, { capture: true } );

		this.domElement.style.touchAction = 'auto';

	}

	dispose() {

		this.disconnect();

	}

	/**
	 * Get the current vertical rotation, in radians.
	 *
	 * @return {number} The current vertical rotation, in radians.
	 */
	getPolarAngle() {

		return this._spherical.phi;

	}

	/**
	 * Get the current horizontal rotation, in radians.
	 *
	 * @return {number} The current horizontal rotation, in radians.
	 */
	getAzimuthalAngle() {

		return this._spherical.theta;

	}

	/**
	 * Returns the distance from the camera to the target.
	 *
	 * @return {number} The distance from the camera to the target.
	 */
	getDistance() {

		return this.object.position.distanceTo( this.target );

	}

	/**
	 * Adds key event listeners to the given DOM element.
	 * `window` is a recommended argument for using this method.
	 *
	 * @param {HTMLElement} domElement - The DOM element
	 */
	listenToKeyEvents( domElement ) {

		domElement.addEventListener( 'keydown', this._onKeyDown );
		this._domElementKeyEvents = domElement;

	}

	/**
	 * Removes the key event listener previously defined with `listenToKeyEvents()`.
	 */
	stopListenToKeyEvents() {

		if ( this._domElementKeyEvents !== null ) {

			this._domElementKeyEvents.removeEventListener( 'keydown', this._onKeyDown );
			this._domElementKeyEvents = null;

		}

	}

	/**
	 * Save the current state of the controls. This can later be recovered with `reset()`.
	 */
	saveState() {

		this.target0.copy( this.target );
		this.position0.copy( this.object.position );
		this.zoom0 = this.object.zoom;

	}

	/**
	 * Reset the controls to their state from either the last time the `saveState()`
	 * was called, or the initial state.
	 */
	reset() {

		this.target.copy( this.target0 );
		this.object.position.copy( this.position0 );
		this.object.zoom = this.zoom0;

		this.object.updateProjectionMatrix();
		this.dispatchEvent( _changeEvent );

		this.update();

		this.state = _STATE.NONE;

	}

	update( deltaTime = null ) {

		const position = this.object.position;

		_v.copy( position ).sub( this.target );

		// rotate offset to "y-axis-is-up" space
		_v.applyQuaternion( this._quat );

		// angle from z-axis around y-axis
		this._spherical.setFromVector3( _v );

		if ( this.autoRotate && this.state === _STATE.NONE ) {

			this._rotateLeft( this._getAutoRotationAngle( deltaTime ) );

		}

		if ( this.enableDamping ) {

			this._spherical.theta += this._sphericalDelta.theta * this.dampingFactor;
			this._spherical.phi += this._sphericalDelta.phi * this.dampingFactor;

		} else {

			this._spherical.theta += this._sphericalDelta.theta;
			this._spherical.phi += this._sphericalDelta.phi;

		}

		// restrict theta to be between desired limits

		let min = this.minAzimuthAngle;
		let max = this.maxAzimuthAngle;

		if ( isFinite( min ) && isFinite( max ) ) {

			if ( min < - Math.PI ) min += _twoPI; else if ( min > Math.PI ) min -= _twoPI;

			if ( max < - Math.PI ) max += _twoPI; else if ( max > Math.PI ) max -= _twoPI;

			if ( min <= max ) {

				this._spherical.theta = Math.max( min, Math.min( max, this._spherical.theta ) );

			} else {

				this._spherical.theta = ( this._spherical.theta > ( min + max ) / 2 ) ?
					Math.max( min, this._spherical.theta ) :
					Math.min( max, this._spherical.theta );

			}

		}

		// restrict phi to be between desired limits
		this._spherical.phi = Math.max( this.minPolarAngle, Math.min( this.maxPolarAngle, this._spherical.phi ) );

		this._spherical.makeSafe();


		// move target to panned location

		if ( this.enableDamping === true ) {

			this.target.addScaledVector( this._panOffset, this.dampingFactor );

		} else {

			this.target.add( this._panOffset );

		}

		// Limit the target distance from the cursor to create a sphere around the center of interest
		this.target.sub( this.cursor );
		this.target.clampLength( this.minTargetRadius, this.maxTargetRadius );
		this.target.add( this.cursor );

		let zoomChanged = false;
		// adjust the camera position based on zoom only if we're not zooming to the cursor or if it's an ortho camera
		// we adjust zoom later in these cases
		if ( this.zoomToCursor && this._performCursorZoom || this.object.isOrthographicCamera ) {

			this._spherical.radius = this._clampDistance( this._spherical.radius );

		} else {

			const prevRadius = this._spherical.radius;
			this._spherical.radius = this._clampDistance( this._spherical.radius * this._scale );
			zoomChanged = prevRadius != this._spherical.radius;

		}

		_v.setFromSpherical( this._spherical );

		// rotate offset back to "camera-up-vector-is-up" space
		_v.applyQuaternion( this._quatInverse );

		position.copy( this.target ).add( _v );

		this.object.lookAt( this.target );

		if ( this.enableDamping === true ) {

			this._sphericalDelta.theta *= ( 1 - this.dampingFactor );
			this._sphericalDelta.phi *= ( 1 - this.dampingFactor );

			this._panOffset.multiplyScalar( 1 - this.dampingFactor );

		} else {

			this._sphericalDelta.set( 0, 0, 0 );

			this._panOffset.set( 0, 0, 0 );

		}

		// adjust camera position
		if ( this.zoomToCursor && this._performCursorZoom ) {

			let newRadius = null;
			if ( this.object.isPerspectiveCamera ) {

				// move the camera down the pointer ray
				// this method avoids floating point error
				const prevRadius = _v.length();
				newRadius = this._clampDistance( prevRadius * this._scale );

				const radiusDelta = prevRadius - newRadius;
				this.object.position.addScaledVector( this._dollyDirection, radiusDelta );
				this.object.updateMatrixWorld();

				zoomChanged = !! radiusDelta;

			} else if ( this.object.isOrthographicCamera ) {

				// adjust the ortho camera position based on zoom changes
				const mouseBefore = new Vector3( this._mouse.x, this._mouse.y, 0 );
				mouseBefore.unproject( this.object );

				const prevZoom = this.object.zoom;
				this.object.zoom = Math.max( this.minZoom, Math.min( this.maxZoom, this.object.zoom / this._scale ) );
				this.object.updateProjectionMatrix();

				zoomChanged = prevZoom !== this.object.zoom;

				const mouseAfter = new Vector3( this._mouse.x, this._mouse.y, 0 );
				mouseAfter.unproject( this.object );

				this.object.position.sub( mouseAfter ).add( mouseBefore );
				this.object.updateMatrixWorld();

				newRadius = _v.length();

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.' );
				this.zoomToCursor = false;

			}

			// handle the placement of the target
			if ( newRadius !== null ) {

				if ( this.screenSpacePanning ) {

					// position the orbit target in front of the new camera position
					this.target.set( 0, 0, -1 )
						.transformDirection( this.object.matrix )
						.multiplyScalar( newRadius )
						.add( this.object.position );

				} else {

					// get the ray and translation plane to compute target
					_ray.origin.copy( this.object.position );
					_ray.direction.set( 0, 0, -1 ).transformDirection( this.object.matrix );

					// if the camera is 20 degrees above the horizon then don't adjust the focus target to avoid
					// extremely large values
					if ( Math.abs( this.object.up.dot( _ray.direction ) ) < _TILT_LIMIT ) {

						this.object.lookAt( this.target );

					} else {

						_plane.setFromNormalAndCoplanarPoint( this.object.up, this.target );
						_ray.intersectPlane( _plane, this.target );

					}

				}

			}

		} else if ( this.object.isOrthographicCamera ) {

			const prevZoom = this.object.zoom;
			this.object.zoom = Math.max( this.minZoom, Math.min( this.maxZoom, this.object.zoom / this._scale ) );

			if ( prevZoom !== this.object.zoom ) {

				this.object.updateProjectionMatrix();
				zoomChanged = true;

			}

		}

		this._scale = 1;
		this._performCursorZoom = false;

		// update condition is:
		// min(camera displacement, camera rotation in radians)^2 > EPS
		// using small-angle approximation cos(x/2) = 1 - x^2 / 8

		if ( zoomChanged ||
			this._lastPosition.distanceToSquared( this.object.position ) > _EPS ||
			8 * ( 1 - this._lastQuaternion.dot( this.object.quaternion ) ) > _EPS ||
			this._lastTargetPosition.distanceToSquared( this.target ) > _EPS ) {

			this.dispatchEvent( _changeEvent );

			this._lastPosition.copy( this.object.position );
			this._lastQuaternion.copy( this.object.quaternion );
			this._lastTargetPosition.copy( this.target );

			return true;

		}

		return false;

	}

	_getAutoRotationAngle( deltaTime ) {

		if ( deltaTime !== null ) {

			return ( _twoPI / 60 * this.autoRotateSpeed ) * deltaTime;

		} else {

			return _twoPI / 60 / 60 * this.autoRotateSpeed;

		}

	}

	_getZoomScale( delta ) {

		const normalizedDelta = Math.abs( delta * 0.01 );
		return Math.pow( 0.95, this.zoomSpeed * normalizedDelta );

	}

	_rotateLeft( angle ) {

		this._sphericalDelta.theta -= angle;

	}

	_rotateUp( angle ) {

		this._sphericalDelta.phi -= angle;

	}

	_panLeft( distance, objectMatrix ) {

		_v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
		_v.multiplyScalar( - distance );

		this._panOffset.add( _v );

	}

	_panUp( distance, objectMatrix ) {

		if ( this.screenSpacePanning === true ) {

			_v.setFromMatrixColumn( objectMatrix, 1 );

		} else {

			_v.setFromMatrixColumn( objectMatrix, 0 );
			_v.crossVectors( this.object.up, _v );

		}

		_v.multiplyScalar( distance );

		this._panOffset.add( _v );

	}

	// deltaX and deltaY are in pixels; right and down are positive
	_pan( deltaX, deltaY ) {

		const element = this.domElement;

		if ( this.object.isPerspectiveCamera ) {

			// perspective
			const position = this.object.position;
			_v.copy( position ).sub( this.target );
			let targetDistance = _v.length();

			// half of the fov is center to top of screen
			targetDistance *= Math.tan( ( this.object.fov / 2 ) * Math.PI / 180.0 );

			// we use only clientHeight here so aspect ratio does not distort speed
			this._panLeft( 2 * deltaX * targetDistance / element.clientHeight, this.object.matrix );
			this._panUp( 2 * deltaY * targetDistance / element.clientHeight, this.object.matrix );

		} else if ( this.object.isOrthographicCamera ) {

			// orthographic
			this._panLeft( deltaX * ( this.object.right - this.object.left ) / this.object.zoom / element.clientWidth, this.object.matrix );
			this._panUp( deltaY * ( this.object.top - this.object.bottom ) / this.object.zoom / element.clientHeight, this.object.matrix );

		} else {

			// camera neither orthographic nor perspective
			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
			this.enablePan = false;

		}

	}

	_dollyOut( dollyScale ) {

		if ( this.object.isPerspectiveCamera || this.object.isOrthographicCamera ) {

			this._scale /= dollyScale;

		} else {

			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
			this.enableZoom = false;

		}

	}

	_dollyIn( dollyScale ) {

		if ( this.object.isPerspectiveCamera || this.object.isOrthographicCamera ) {

			this._scale *= dollyScale;

		} else {

			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
			this.enableZoom = false;

		}

	}

	_updateZoomParameters( x, y ) {

		if ( ! this.zoomToCursor ) {

			return;

		}

		this._performCursorZoom = true;

		const rect = this.domElement.getBoundingClientRect();
		const dx = x - rect.left;
		const dy = y - rect.top;
		const w = rect.width;
		const h = rect.height;

		this._mouse.x = ( dx / w ) * 2 - 1;
		this._mouse.y = - ( dy / h ) * 2 + 1;

		this._dollyDirection.set( this._mouse.x, this._mouse.y, 1 ).unproject( this.object ).sub( this.object.position ).normalize();

	}

	_clampDistance( dist ) {

		return Math.max( this.minDistance, Math.min( this.maxDistance, dist ) );

	}

	//
	// event callbacks - update the object state
	//

	_handleMouseDownRotate( event ) {

		this._rotateStart.set( event.clientX, event.clientY );

	}

	_handleMouseDownDolly( event ) {

		this._updateZoomParameters( event.clientX, event.clientX );
		this._dollyStart.set( event.clientX, event.clientY );

	}

	_handleMouseDownPan( event ) {

		this._panStart.set( event.clientX, event.clientY );

	}

	_handleMouseMoveRotate( event ) {

		this._rotateEnd.set( event.clientX, event.clientY );

		this._rotateDelta.subVectors( this._rotateEnd, this._rotateStart ).multiplyScalar( this.rotateSpeed );

		const element = this.domElement;

		this._rotateLeft( _twoPI * this._rotateDelta.x / element.clientHeight ); // yes, height

		this._rotateUp( _twoPI * this._rotateDelta.y / element.clientHeight );

		this._rotateStart.copy( this._rotateEnd );

		this.update();

	}

	_handleMouseMoveDolly( event ) {

		this._dollyEnd.set( event.clientX, event.clientY );

		this._dollyDelta.subVectors( this._dollyEnd, this._dollyStart );

		if ( this._dollyDelta.y > 0 ) {

			this._dollyOut( this._getZoomScale( this._dollyDelta.y ) );

		} else if ( this._dollyDelta.y < 0 ) {

			this._dollyIn( this._getZoomScale( this._dollyDelta.y ) );

		}

		this._dollyStart.copy( this._dollyEnd );

		this.update();

	}

	_handleMouseMovePan( event ) {

		this._panEnd.set( event.clientX, event.clientY );

		this._panDelta.subVectors( this._panEnd, this._panStart ).multiplyScalar( this.panSpeed );

		this._pan( this._panDelta.x, this._panDelta.y );

		this._panStart.copy( this._panEnd );

		this.update();

	}

	_handleMouseWheel( event ) {

		this._updateZoomParameters( event.clientX, event.clientY );

		if ( event.deltaY < 0 ) {

			this._dollyIn( this._getZoomScale( event.deltaY ) );

		} else if ( event.deltaY > 0 ) {

			this._dollyOut( this._getZoomScale( event.deltaY ) );

		}

		this.update();

	}

	_handleKeyDown( event ) {

		let needsUpdate = false;

		switch ( event.code ) {

			case this.keys.UP:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( this.enableRotate ) {

						this._rotateUp( _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

					}

				} else {

					if ( this.enablePan ) {

						this._pan( 0, this.keyPanSpeed );

					}

				}

				needsUpdate = true;
				break;

			case this.keys.BOTTOM:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( this.enableRotate ) {

						this._rotateUp( - _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

					}

				} else {

					if ( this.enablePan ) {

						this._pan( 0, - this.keyPanSpeed );

					}

				}

				needsUpdate = true;
				break;

			case this.keys.LEFT:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( this.enableRotate ) {

						this._rotateLeft( _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

					}

				} else {

					if ( this.enablePan ) {

						this._pan( this.keyPanSpeed, 0 );

					}

				}

				needsUpdate = true;
				break;

			case this.keys.RIGHT:

				if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

					if ( this.enableRotate ) {

						this._rotateLeft( - _twoPI * this.keyRotateSpeed / this.domElement.clientHeight );

					}

				} else {

					if ( this.enablePan ) {

						this._pan( - this.keyPanSpeed, 0 );

					}

				}

				needsUpdate = true;
				break;

		}

		if ( needsUpdate ) {

			// prevent the browser from scrolling on cursor keys
			event.preventDefault();

			this.update();

		}


	}

	_handleTouchStartRotate( event ) {

		if ( this._pointers.length === 1 ) {

			this._rotateStart.set( event.pageX, event.pageY );

		} else {

			const position = this._getSecondPointerPosition( event );

			const x = 0.5 * ( event.pageX + position.x );
			const y = 0.5 * ( event.pageY + position.y );

			this._rotateStart.set( x, y );

		}

	}

	_handleTouchStartPan( event ) {

		if ( this._pointers.length === 1 ) {

			this._panStart.set( event.pageX, event.pageY );

		} else {

			const position = this._getSecondPointerPosition( event );

			const x = 0.5 * ( event.pageX + position.x );
			const y = 0.5 * ( event.pageY + position.y );

			this._panStart.set( x, y );

		}

	}

	_handleTouchStartDolly( event ) {

		const position = this._getSecondPointerPosition( event );

		const dx = event.pageX - position.x;
		const dy = event.pageY - position.y;

		const distance = Math.sqrt( dx * dx + dy * dy );

		this._dollyStart.set( 0, distance );

	}

	_handleTouchStartDollyPan( event ) {

		if ( this.enableZoom ) this._handleTouchStartDolly( event );

		if ( this.enablePan ) this._handleTouchStartPan( event );

	}

	_handleTouchStartDollyRotate( event ) {

		if ( this.enableZoom ) this._handleTouchStartDolly( event );

		if ( this.enableRotate ) this._handleTouchStartRotate( event );

	}

	_handleTouchMoveRotate( event ) {

		if ( this._pointers.length == 1 ) {

			this._rotateEnd.set( event.pageX, event.pageY );

		} else {

			const position = this._getSecondPointerPosition( event );

			const x = 0.5 * ( event.pageX + position.x );
			const y = 0.5 * ( event.pageY + position.y );

			this._rotateEnd.set( x, y );

		}

		this._rotateDelta.subVectors( this._rotateEnd, this._rotateStart ).multiplyScalar( this.rotateSpeed );

		const element = this.domElement;

		this._rotateLeft( _twoPI * this._rotateDelta.x / element.clientHeight ); // yes, height

		this._rotateUp( _twoPI * this._rotateDelta.y / element.clientHeight );

		this._rotateStart.copy( this._rotateEnd );

	}

	_handleTouchMovePan( event ) {

		if ( this._pointers.length === 1 ) {

			this._panEnd.set( event.pageX, event.pageY );

		} else {

			const position = this._getSecondPointerPosition( event );

			const x = 0.5 * ( event.pageX + position.x );
			const y = 0.5 * ( event.pageY + position.y );

			this._panEnd.set( x, y );

		}

		this._panDelta.subVectors( this._panEnd, this._panStart ).multiplyScalar( this.panSpeed );

		this._pan( this._panDelta.x, this._panDelta.y );

		this._panStart.copy( this._panEnd );

	}

	_handleTouchMoveDolly( event ) {

		const position = this._getSecondPointerPosition( event );

		const dx = event.pageX - position.x;
		const dy = event.pageY - position.y;

		const distance = Math.sqrt( dx * dx + dy * dy );

		this._dollyEnd.set( 0, distance );

		this._dollyDelta.set( 0, Math.pow( this._dollyEnd.y / this._dollyStart.y, this.zoomSpeed ) );

		this._dollyOut( this._dollyDelta.y );

		this._dollyStart.copy( this._dollyEnd );

		const centerX = ( event.pageX + position.x ) * 0.5;
		const centerY = ( event.pageY + position.y ) * 0.5;

		this._updateZoomParameters( centerX, centerY );

	}

	_handleTouchMoveDollyPan( event ) {

		if ( this.enableZoom ) this._handleTouchMoveDolly( event );

		if ( this.enablePan ) this._handleTouchMovePan( event );

	}

	_handleTouchMoveDollyRotate( event ) {

		if ( this.enableZoom ) this._handleTouchMoveDolly( event );

		if ( this.enableRotate ) this._handleTouchMoveRotate( event );

	}

	// pointers

	_addPointer( event ) {

		this._pointers.push( event.pointerId );

	}

	_removePointer( event ) {

		delete this._pointerPositions[ event.pointerId ];

		for ( let i = 0; i < this._pointers.length; i ++ ) {

			if ( this._pointers[ i ] == event.pointerId ) {

				this._pointers.splice( i, 1 );
				return;

			}

		}

	}

	_isTrackingPointer( event ) {

		for ( let i = 0; i < this._pointers.length; i ++ ) {

			if ( this._pointers[ i ] == event.pointerId ) return true;

		}

		return false;

	}

	_trackPointer( event ) {

		let position = this._pointerPositions[ event.pointerId ];

		if ( position === undefined ) {

			position = new Vector2();
			this._pointerPositions[ event.pointerId ] = position;

		}

		position.set( event.pageX, event.pageY );

	}

	_getSecondPointerPosition( event ) {

		const pointerId = ( event.pointerId === this._pointers[ 0 ] ) ? this._pointers[ 1 ] : this._pointers[ 0 ];

		return this._pointerPositions[ pointerId ];

	}

	//

	_customWheelEvent( event ) {

		const mode = event.deltaMode;

		// minimal wheel event altered to meet delta-zoom demand
		const newEvent = {
			clientX: event.clientX,
			clientY: event.clientY,
			deltaY: event.deltaY,
		};

		switch ( mode ) {

			case 1: // LINE_MODE
				newEvent.deltaY *= 16;
				break;

			case 2: // PAGE_MODE
				newEvent.deltaY *= 100;
				break;

		}

		// detect if event was triggered by pinching
		if ( event.ctrlKey && ! this._controlActive ) {

			newEvent.deltaY *= 10;

		}

		return newEvent;

	}

}

function onPointerDown( event ) {

	if ( this.enabled === false ) return;

	if ( this._pointers.length === 0 ) {

		this.domElement.setPointerCapture( event.pointerId );

		this.domElement.addEventListener( 'pointermove', this._onPointerMove );
		this.domElement.addEventListener( 'pointerup', this._onPointerUp );

	}

	//

	if ( this._isTrackingPointer( event ) ) return;

	//

	this._addPointer( event );

	if ( event.pointerType === 'touch' ) {

		this._onTouchStart( event );

	} else {

		this._onMouseDown( event );

	}

}

function onPointerMove( event ) {

	if ( this.enabled === false ) return;

	if ( event.pointerType === 'touch' ) {

		this._onTouchMove( event );

	} else {

		this._onMouseMove( event );

	}

}

function onPointerUp( event ) {

	this._removePointer( event );

	switch ( this._pointers.length ) {

		case 0:

			this.domElement.releasePointerCapture( event.pointerId );

			this.domElement.removeEventListener( 'pointermove', this._onPointerMove );
			this.domElement.removeEventListener( 'pointerup', this._onPointerUp );

			this.dispatchEvent( _endEvent );

			this.state = _STATE.NONE;

			break;

		case 1:

			const pointerId = this._pointers[ 0 ];
			const position = this._pointerPositions[ pointerId ];

			// minimal placeholder event - allows state correction on pointer-up
			this._onTouchStart( { pointerId: pointerId, pageX: position.x, pageY: position.y } );

			break;

	}

}

function onMouseDown( event ) {

	let mouseAction;

	switch ( event.button ) {

		case 0:

			mouseAction = this.mouseButtons.LEFT;
			break;

		case 1:

			mouseAction = this.mouseButtons.MIDDLE;
			break;

		case 2:

			mouseAction = this.mouseButtons.RIGHT;
			break;

		default:

			mouseAction = -1;

	}

	switch ( mouseAction ) {

		case MOUSE.DOLLY:

			if ( this.enableZoom === false ) return;

			this._handleMouseDownDolly( event );

			this.state = _STATE.DOLLY;

			break;

		case MOUSE.ROTATE:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

				if ( this.enablePan === false ) return;

				this._handleMouseDownPan( event );

				this.state = _STATE.PAN;

			} else {

				if ( this.enableRotate === false ) return;

				this._handleMouseDownRotate( event );

				this.state = _STATE.ROTATE;

			}

			break;

		case MOUSE.PAN:

			if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

				if ( this.enableRotate === false ) return;

				this._handleMouseDownRotate( event );

				this.state = _STATE.ROTATE;

			} else {

				if ( this.enablePan === false ) return;

				this._handleMouseDownPan( event );

				this.state = _STATE.PAN;

			}

			break;

		default:

			this.state = _STATE.NONE;

	}

	if ( this.state !== _STATE.NONE ) {

		this.dispatchEvent( _startEvent );

	}

}

function onMouseMove( event ) {

	switch ( this.state ) {

		case _STATE.ROTATE:

			if ( this.enableRotate === false ) return;

			this._handleMouseMoveRotate( event );

			break;

		case _STATE.DOLLY:

			if ( this.enableZoom === false ) return;

			this._handleMouseMoveDolly( event );

			break;

		case _STATE.PAN:

			if ( this.enablePan === false ) return;

			this._handleMouseMovePan( event );

			break;

	}

}

function onMouseWheel( event ) {

	if ( this.enabled === false || this.enableZoom === false || this.state !== _STATE.NONE ) return;

	event.preventDefault();

	this.dispatchEvent( _startEvent );

	this._handleMouseWheel( this._customWheelEvent( event ) );

	this.dispatchEvent( _endEvent );

}

function onKeyDown( event ) {

	if ( this.enabled === false ) return;

	this._handleKeyDown( event );

}

function onTouchStart( event ) {

	this._trackPointer( event );

	switch ( this._pointers.length ) {

		case 1:

			switch ( this.touches.ONE ) {

				case TOUCH.ROTATE:

					if ( this.enableRotate === false ) return;

					this._handleTouchStartRotate( event );

					this.state = _STATE.TOUCH_ROTATE;

					break;

				case TOUCH.PAN:

					if ( this.enablePan === false ) return;

					this._handleTouchStartPan( event );

					this.state = _STATE.TOUCH_PAN;

					break;

				default:

					this.state = _STATE.NONE;

			}

			break;

		case 2:

			switch ( this.touches.TWO ) {

				case TOUCH.DOLLY_PAN:

					if ( this.enableZoom === false && this.enablePan === false ) return;

					this._handleTouchStartDollyPan( event );

					this.state = _STATE.TOUCH_DOLLY_PAN;

					break;

				case TOUCH.DOLLY_ROTATE:

					if ( this.enableZoom === false && this.enableRotate === false ) return;

					this._handleTouchStartDollyRotate( event );

					this.state = _STATE.TOUCH_DOLLY_ROTATE;

					break;

				default:

					this.state = _STATE.NONE;

			}

			break;

		default:

			this.state = _STATE.NONE;

	}

	if ( this.state !== _STATE.NONE ) {

		this.dispatchEvent( _startEvent );

	}

}

function onTouchMove( event ) {

	this._trackPointer( event );

	switch ( this.state ) {

		case _STATE.TOUCH_ROTATE:

			if ( this.enableRotate === false ) return;

			this._handleTouchMoveRotate( event );

			this.update();

			break;

		case _STATE.TOUCH_PAN:

			if ( this.enablePan === false ) return;

			this._handleTouchMovePan( event );

			this.update();

			break;

		case _STATE.TOUCH_DOLLY_PAN:

			if ( this.enableZoom === false && this.enablePan === false ) return;

			this._handleTouchMoveDollyPan( event );

			this.update();

			break;

		case _STATE.TOUCH_DOLLY_ROTATE:

			if ( this.enableZoom === false && this.enableRotate === false ) return;

			this._handleTouchMoveDollyRotate( event );

			this.update();

			break;

		default:

			this.state = _STATE.NONE;

	}

}

function onContextMenu( event ) {

	if ( this.enabled === false ) return;

	event.preventDefault();

}

function interceptControlDown( event ) {

	if ( event.key === 'Control' ) {

		this._controlActive = true;

		const document = this.domElement.getRootNode(); // offscreen canvas compatibility

		document.addEventListener( 'keyup', this._interceptControlUp, { passive: true, capture: true } );

	}

}

function interceptControlUp( event ) {

	if ( event.key === 'Control' ) {

		this._controlActive = false;

		const document = this.domElement.getRootNode(); // offscreen canvas compatibility

		document.removeEventListener( 'keyup', this._interceptControlUp, { passive: true, capture: true } );

	}

}

/**
 * Returns a new geometry with vertices for which all similar vertex attributes (within tolerance) are merged.
 *
 * @param {BufferGeometry} geometry - The geometry to merge vertices for.
 * @param {number} [tolerance=1e-4] - The tolerance value.
 * @return {BufferGeometry} - The new geometry with merged vertices.
 */
function mergeVertices( geometry, tolerance = 1e-4 ) {

	tolerance = Math.max( tolerance, Number.EPSILON );

	// Generate an index buffer if the geometry doesn't have one, or optimize it
	// if it's already available.
	const hashToIndex = {};
	const indices = geometry.getIndex();
	const positions = geometry.getAttribute( 'position' );
	const vertexCount = indices ? indices.count : positions.count;

	// next value for triangle indices
	let nextIndex = 0;

	// attributes and new attribute arrays
	const attributeNames = Object.keys( geometry.attributes );
	const tmpAttributes = {};
	const tmpMorphAttributes = {};
	const newIndices = [];
	const getters = [ 'getX', 'getY', 'getZ', 'getW' ];
	const setters = [ 'setX', 'setY', 'setZ', 'setW' ];

	// Initialize the arrays, allocating space conservatively. Extra
	// space will be trimmed in the last step.
	for ( let i = 0, l = attributeNames.length; i < l; i ++ ) {

		const name = attributeNames[ i ];
		const attr = geometry.attributes[ name ];

		tmpAttributes[ name ] = new attr.constructor(
			new attr.array.constructor( attr.count * attr.itemSize ),
			attr.itemSize,
			attr.normalized
		);

		const morphAttributes = geometry.morphAttributes[ name ];
		if ( morphAttributes ) {

			if ( ! tmpMorphAttributes[ name ] ) tmpMorphAttributes[ name ] = [];
			morphAttributes.forEach( ( morphAttr, i ) => {

				const array = new morphAttr.array.constructor( morphAttr.count * morphAttr.itemSize );
				tmpMorphAttributes[ name ][ i ] = new morphAttr.constructor( array, morphAttr.itemSize, morphAttr.normalized );

			} );

		}

	}

	// convert the error tolerance to an amount of decimal places to truncate to
	const halfTolerance = tolerance * 0.5;
	const exponent = Math.log10( 1 / tolerance );
	const hashMultiplier = Math.pow( 10, exponent );
	const hashAdditive = halfTolerance * hashMultiplier;
	for ( let i = 0; i < vertexCount; i ++ ) {

		const index = indices ? indices.getX( i ) : i;

		// Generate a hash for the vertex attributes at the current index 'i'
		let hash = '';
		for ( let j = 0, l = attributeNames.length; j < l; j ++ ) {

			const name = attributeNames[ j ];
			const attribute = geometry.getAttribute( name );
			const itemSize = attribute.itemSize;

			for ( let k = 0; k < itemSize; k ++ ) {

				// double tilde truncates the decimal value
				hash += `${ ~ ~ ( attribute[ getters[ k ] ]( index ) * hashMultiplier + hashAdditive ) },`;

			}

		}

		// Add another reference to the vertex if it's already
		// used by another index
		if ( hash in hashToIndex ) {

			newIndices.push( hashToIndex[ hash ] );

		} else {

			// copy data to the new index in the temporary attributes
			for ( let j = 0, l = attributeNames.length; j < l; j ++ ) {

				const name = attributeNames[ j ];
				const attribute = geometry.getAttribute( name );
				const morphAttributes = geometry.morphAttributes[ name ];
				const itemSize = attribute.itemSize;
				const newArray = tmpAttributes[ name ];
				const newMorphArrays = tmpMorphAttributes[ name ];

				for ( let k = 0; k < itemSize; k ++ ) {

					const getterFunc = getters[ k ];
					const setterFunc = setters[ k ];
					newArray[ setterFunc ]( nextIndex, attribute[ getterFunc ]( index ) );

					if ( morphAttributes ) {

						for ( let m = 0, ml = morphAttributes.length; m < ml; m ++ ) {

							newMorphArrays[ m ][ setterFunc ]( nextIndex, morphAttributes[ m ][ getterFunc ]( index ) );

						}

					}

				}

			}

			hashToIndex[ hash ] = nextIndex;
			newIndices.push( nextIndex );
			nextIndex ++;

		}

	}

	// generate result BufferGeometry
	const result = geometry.clone();
	for ( const name in geometry.attributes ) {

		const tmpAttribute = tmpAttributes[ name ];

		result.setAttribute( name, new tmpAttribute.constructor(
			tmpAttribute.array.slice( 0, nextIndex * tmpAttribute.itemSize ),
			tmpAttribute.itemSize,
			tmpAttribute.normalized,
		) );

		if ( ! ( name in tmpMorphAttributes ) ) continue;

		for ( let j = 0; j < tmpMorphAttributes[ name ].length; j ++ ) {

			const tmpMorphAttribute = tmpMorphAttributes[ name ][ j ];

			result.morphAttributes[ name ][ j ] = new tmpMorphAttribute.constructor(
				tmpMorphAttribute.array.slice( 0, nextIndex * tmpMorphAttribute.itemSize ),
				tmpMorphAttribute.itemSize,
				tmpMorphAttribute.normalized,
			);

		}

	}

	// indices

	result.setIndex( newIndices );

	return result;

}

/**
 * Returns a new indexed geometry based on `TrianglesDrawMode` draw mode.
 * This mode corresponds to the `gl.TRIANGLES` primitive in WebGL.
 *
 * @param {BufferGeometry} geometry - The geometry to convert.
 * @param {number} drawMode - The current draw mode.
 * @return {BufferGeometry} The new geometry using `TrianglesDrawMode`.
 */
function toTrianglesDrawMode( geometry, drawMode ) {

	if ( drawMode === TrianglesDrawMode ) {

		console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
		return geometry;

	}

	if ( drawMode === TriangleFanDrawMode || drawMode === TriangleStripDrawMode ) {

		let index = geometry.getIndex();

		// generate index if not present

		if ( index === null ) {

			const indices = [];

			const position = geometry.getAttribute( 'position' );

			if ( position !== undefined ) {

				for ( let i = 0; i < position.count; i ++ ) {

					indices.push( i );

				}

				geometry.setIndex( indices );
				index = geometry.getIndex();

			} else {

				console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
				return geometry;

			}

		}

		//

		const numberOfTriangles = index.count - 2;
		const newIndices = [];

		if ( drawMode === TriangleFanDrawMode ) {

			// gl.TRIANGLE_FAN

			for ( let i = 1; i <= numberOfTriangles; i ++ ) {

				newIndices.push( index.getX( 0 ) );
				newIndices.push( index.getX( i ) );
				newIndices.push( index.getX( i + 1 ) );

			}

		} else {

			// gl.TRIANGLE_STRIP

			for ( let i = 0; i < numberOfTriangles; i ++ ) {

				if ( i % 2 === 0 ) {

					newIndices.push( index.getX( i ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i + 2 ) );

				} else {

					newIndices.push( index.getX( i + 2 ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i ) );

				}

			}

		}

		if ( ( newIndices.length / 3 ) !== numberOfTriangles ) {

			console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

		}

		// build final geometry

		const newGeometry = geometry.clone();
		newGeometry.setIndex( newIndices );
		newGeometry.clearGroups();

		return newGeometry;

	} else {

		console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
		return geometry;

	}

}

/**
 * A loader for the glTF 2.0 format.
 *
 * [glTF](https://www.khronos.org/gltf/} (GL Transmission Format) is an [open format specification]{@link https://github.com/KhronosGroup/glTF/tree/main/specification/2.0)
 * for efficient delivery and loading of 3D content. Assets may be provided either in JSON (.gltf) or binary (.glb)
 * format. External files store textures (.jpg, .png) and additional binary data (.bin). A glTF asset may deliver
 * one or more scenes, including meshes, materials, textures, skins, skeletons, morph targets, animations, lights,
 * and/or cameras.
 *
 * `GLTFLoader` uses {@link ImageBitmapLoader} whenever possible. Be advised that image bitmaps are not
 * automatically GC-collected when they are no longer referenced, and they require special handling during
 * the disposal process.
 *
 * `GLTFLoader` supports the following glTF 2.0 extensions:
 * - KHR_draco_mesh_compression
 * - KHR_materials_clearcoat
 * - KHR_materials_dispersion
 * - KHR_materials_ior
 * - KHR_materials_specular
 * - KHR_materials_transmission
 * - KHR_materials_iridescence
 * - KHR_materials_unlit
 * - KHR_materials_volume
 * - KHR_mesh_quantization
 * - KHR_lights_punctual
 * - KHR_texture_basisu
 * - KHR_texture_transform
 * - EXT_texture_webp
 * - EXT_meshopt_compression
 * - EXT_mesh_gpu_instancing
 *
 * The following glTF 2.0 extension is supported by an external user plugin:
 * - [KHR_materials_variants](https://github.com/takahirox/three-gltf-extensions)
 * - [MSFT_texture_dds](https://github.com/takahirox/three-gltf-extensions)
 * - [KHR_animation_pointer](https://github.com/needle-tools/three-animation-pointer)
 * - [NEEDLE_progressive](https://github.com/needle-tools/gltf-progressive)
 *
 * ```js
 * const loader = new GLTFLoader();
 *
 * // Optional: Provide a DRACOLoader instance to decode compressed mesh data
 * const dracoLoader = new DRACOLoader();
 * dracoLoader.setDecoderPath( '/examples/jsm/libs/draco/' );
 * loader.setDRACOLoader( dracoLoader );
 *
 * const gltf = await loader.loadAsync( 'models/gltf/duck/duck.gltf' );
 * scene.add( gltf.scene );
 * ```
 *
 * @augments Loader
 * @three_import import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
 */
class GLTFLoader extends Loader {

	/**
	 * Constructs a new glTF loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		this.dracoLoader = null;
		this.ktx2Loader = null;
		this.meshoptDecoder = null;

		this.pluginCallbacks = [];

		this.register( function ( parser ) {

			return new GLTFMaterialsClearcoatExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsDispersionExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFTextureBasisUExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFTextureWebPExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFTextureAVIFExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsSheenExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsTransmissionExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsVolumeExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsIorExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsEmissiveStrengthExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsSpecularExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsIridescenceExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsAnisotropyExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMaterialsBumpExtension$1( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFLightsExtension( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMeshoptCompression( parser );

		} );

		this.register( function ( parser ) {

			return new GLTFMeshGpuInstancing$1( parser );

		} );

	}

	/**
	 * Starts loading from the given URL and passes the loaded glTF asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		let resourcePath;

		if ( this.resourcePath !== '' ) {

			resourcePath = this.resourcePath;

		} else if ( this.path !== '' ) {

			// If a base path is set, resources will be relative paths from that plus the relative path of the gltf file
			// Example  path = 'https://my-cnd-server.com/', url = 'assets/models/model.gltf'
			// resourcePath = 'https://my-cnd-server.com/assets/models/'
			// referenced resource 'model.bin' will be loaded from 'https://my-cnd-server.com/assets/models/model.bin'
			// referenced resource '../textures/texture.png' will be loaded from 'https://my-cnd-server.com/assets/textures/texture.png'
			const relativeUrl = LoaderUtils.extractUrlBase( url );
			resourcePath = LoaderUtils.resolveURL( relativeUrl, this.path );

		} else {

			resourcePath = LoaderUtils.extractUrlBase( url );

		}

		// Tells the LoadingManager to track an extra item, which resolves after
		// the model is fully loaded. This means the count of items loaded will
		// be incorrect, but ensures manager.onLoad() does not fire early.
		this.manager.itemStart( url );

		const _onError = function ( e ) {

			if ( onError ) {

				onError( e );

			} else {

				console.error( e );

			}

			scope.manager.itemError( url );
			scope.manager.itemEnd( url );

		};

		const loader = new FileLoader( this.manager );

		loader.setPath( this.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );

		loader.load( url, function ( data ) {

			try {

				scope.parse( data, resourcePath, function ( gltf ) {

					onLoad( gltf );

					scope.manager.itemEnd( url );

				}, _onError );

			} catch ( e ) {

				_onError( e );

			}

		}, onProgress, _onError );

	}

	/**
	 * Sets the given Draco loader to this loader. Required for decoding assets
	 * compressed with the `KHR_draco_mesh_compression` extension.
	 *
	 * @param {DRACOLoader} dracoLoader - The Draco loader to set.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	setDRACOLoader( dracoLoader ) {

		this.dracoLoader = dracoLoader;
		return this;

	}

	/**
	 * Sets the given KTX2 loader to this loader. Required for loading KTX2
	 * compressed textures.
	 *
	 * @param {KTX2Loader} ktx2Loader - The KTX2 loader to set.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	setKTX2Loader( ktx2Loader ) {

		this.ktx2Loader = ktx2Loader;
		return this;

	}

	/**
	 * Sets the given meshopt decoder. Required for decoding assets
	 * compressed with the `EXT_meshopt_compression` extension.
	 *
	 * @param {Object} meshoptDecoder - The meshopt decoder to set.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	setMeshoptDecoder( meshoptDecoder ) {

		this.meshoptDecoder = meshoptDecoder;
		return this;

	}

	/**
	 * Registers a plugin callback. This API is internally used to implement the various
	 * glTF extensions but can also used by third-party code to add additional logic
	 * to the loader.
	 *
	 * @param {function(parser:GLTFParser)} callback - The callback function to register.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	register( callback ) {

		if ( this.pluginCallbacks.indexOf( callback ) === -1 ) {

			this.pluginCallbacks.push( callback );

		}

		return this;

	}

	/**
	 * Unregisters a plugin callback.
	 *
	 * @param {Function} callback - The callback function to unregister.
	 * @return {GLTFLoader} A reference to this loader.
	 */
	unregister( callback ) {

		if ( this.pluginCallbacks.indexOf( callback ) !== -1 ) {

			this.pluginCallbacks.splice( this.pluginCallbacks.indexOf( callback ), 1 );

		}

		return this;

	}

	/**
	 * Parses the given FBX data and returns the resulting group.
	 *
	 * @param {string|ArrayBuffer} data - The raw glTF data.
	 * @param {string} path - The URL base path.
	 * @param {function(GLTFLoader~LoadObject)} onLoad - Executed when the loading process has been finished.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	parse( data, path, onLoad, onError ) {

		let json;
		const extensions = {};
		const plugins = {};
		const textDecoder = new TextDecoder();

		if ( typeof data === 'string' ) {

			json = JSON.parse( data );

		} else if ( data instanceof ArrayBuffer ) {

			const magic = textDecoder.decode( new Uint8Array( data, 0, 4 ) );

			if ( magic === BINARY_EXTENSION_HEADER_MAGIC ) {

				try {

					extensions[ EXTENSIONS.KHR_BINARY_GLTF ] = new GLTFBinaryExtension( data );

				} catch ( error ) {

					if ( onError ) onError( error );
					return;

				}

				json = JSON.parse( extensions[ EXTENSIONS.KHR_BINARY_GLTF ].content );

			} else {

				json = JSON.parse( textDecoder.decode( data ) );

			}

		} else {

			json = data;

		}

		if ( json.asset === undefined || json.asset.version[ 0 ] < 2 ) {

			if ( onError ) onError( new Error( 'THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.' ) );
			return;

		}

		const parser = new GLTFParser( json, {

			path: path || this.resourcePath || '',
			crossOrigin: this.crossOrigin,
			requestHeader: this.requestHeader,
			manager: this.manager,
			ktx2Loader: this.ktx2Loader,
			meshoptDecoder: this.meshoptDecoder

		} );

		parser.fileLoader.setRequestHeader( this.requestHeader );

		for ( let i = 0; i < this.pluginCallbacks.length; i ++ ) {

			const plugin = this.pluginCallbacks[ i ]( parser );

			if ( ! plugin.name ) console.error( 'THREE.GLTFLoader: Invalid plugin found: missing name' );

			plugins[ plugin.name ] = plugin;

			// Workaround to avoid determining as unknown extension
			// in addUnknownExtensionsToUserData().
			// Remove this workaround if we move all the existing
			// extension handlers to plugin system
			extensions[ plugin.name ] = true;

		}

		if ( json.extensionsUsed ) {

			for ( let i = 0; i < json.extensionsUsed.length; ++ i ) {

				const extensionName = json.extensionsUsed[ i ];
				const extensionsRequired = json.extensionsRequired || [];

				switch ( extensionName ) {

					case EXTENSIONS.KHR_MATERIALS_UNLIT:
						extensions[ extensionName ] = new GLTFMaterialsUnlitExtension$1();
						break;

					case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
						extensions[ extensionName ] = new GLTFDracoMeshCompressionExtension( json, this.dracoLoader );
						break;

					case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
						extensions[ extensionName ] = new GLTFTextureTransformExtension();
						break;

					case EXTENSIONS.KHR_MESH_QUANTIZATION:
						extensions[ extensionName ] = new GLTFMeshQuantizationExtension();
						break;

					default:

						if ( extensionsRequired.indexOf( extensionName ) >= 0 && plugins[ extensionName ] === undefined ) {

							console.warn( 'THREE.GLTFLoader: Unknown extension "' + extensionName + '".' );

						}

				}

			}

		}

		parser.setExtensions( extensions );
		parser.setPlugins( plugins );
		parser.parse( onLoad, onError );

	}

	/**
	 * Async version of {@link GLTFLoader#parse}.
	 *
	 * @async
	 * @param {string|ArrayBuffer} data - The raw glTF data.
	 * @param {string} path - The URL base path.
	 * @return {Promise<GLTFLoader~LoadObject>} A Promise that resolves with the loaded glTF when the parsing has been finished.
	 */
	parseAsync( data, path ) {

		const scope = this;

		return new Promise( function ( resolve, reject ) {

			scope.parse( data, path, resolve, reject );

		} );

	}

}

/* GLTFREGISTRY */

function GLTFRegistry() {

	let objects = {};

	return	{

		get: function ( key ) {

			return objects[ key ];

		},

		add: function ( key, object ) {

			objects[ key ] = object;

		},

		remove: function ( key ) {

			delete objects[ key ];

		},

		removeAll: function () {

			objects = {};

		}

	};

}

/*********************************/
/********** EXTENSIONS ***********/
/*********************************/

const EXTENSIONS = {
	KHR_BINARY_GLTF: 'KHR_binary_glTF',
	KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
	KHR_LIGHTS_PUNCTUAL: 'KHR_lights_punctual',
	KHR_MATERIALS_CLEARCOAT: 'KHR_materials_clearcoat',
	KHR_MATERIALS_DISPERSION: 'KHR_materials_dispersion',
	KHR_MATERIALS_IOR: 'KHR_materials_ior',
	KHR_MATERIALS_SHEEN: 'KHR_materials_sheen',
	KHR_MATERIALS_SPECULAR: 'KHR_materials_specular',
	KHR_MATERIALS_TRANSMISSION: 'KHR_materials_transmission',
	KHR_MATERIALS_IRIDESCENCE: 'KHR_materials_iridescence',
	KHR_MATERIALS_ANISOTROPY: 'KHR_materials_anisotropy',
	KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
	KHR_MATERIALS_VOLUME: 'KHR_materials_volume',
	KHR_TEXTURE_BASISU: 'KHR_texture_basisu',
	KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
	KHR_MESH_QUANTIZATION: 'KHR_mesh_quantization',
	KHR_MATERIALS_EMISSIVE_STRENGTH: 'KHR_materials_emissive_strength',
	EXT_MATERIALS_BUMP: 'EXT_materials_bump',
	EXT_TEXTURE_WEBP: 'EXT_texture_webp',
	EXT_TEXTURE_AVIF: 'EXT_texture_avif',
	EXT_MESHOPT_COMPRESSION: 'EXT_meshopt_compression',
	EXT_MESH_GPU_INSTANCING: 'EXT_mesh_gpu_instancing'
};

/**
 * Punctual Lights Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_lights_punctual
 *
 * @private
 */
class GLTFLightsExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_LIGHTS_PUNCTUAL;

		// Object3D instance caches
		this.cache = { refs: {}, uses: {} };

	}

	_markDefs() {

		const parser = this.parser;
		const nodeDefs = this.parser.json.nodes || [];

		for ( let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex ++ ) {

			const nodeDef = nodeDefs[ nodeIndex ];

			if ( nodeDef.extensions
					&& nodeDef.extensions[ this.name ]
					&& nodeDef.extensions[ this.name ].light !== undefined ) {

				parser._addNodeRef( this.cache, nodeDef.extensions[ this.name ].light );

			}

		}

	}

	_loadLight( lightIndex ) {

		const parser = this.parser;
		const cacheKey = 'light:' + lightIndex;
		let dependency = parser.cache.get( cacheKey );

		if ( dependency ) return dependency;

		const json = parser.json;
		const extensions = ( json.extensions && json.extensions[ this.name ] ) || {};
		const lightDefs = extensions.lights || [];
		const lightDef = lightDefs[ lightIndex ];
		let lightNode;

		const color = new Color( 0xffffff );

		if ( lightDef.color !== undefined ) color.setRGB( lightDef.color[ 0 ], lightDef.color[ 1 ], lightDef.color[ 2 ], LinearSRGBColorSpace );

		const range = lightDef.range !== undefined ? lightDef.range : 0;

		switch ( lightDef.type ) {

			case 'directional':
				lightNode = new DirectionalLight( color );
				lightNode.target.position.set( 0, 0, -1 );
				lightNode.add( lightNode.target );
				break;

			case 'point':
				lightNode = new PointLight( color );
				lightNode.distance = range;
				break;

			case 'spot':
				lightNode = new SpotLight( color );
				lightNode.distance = range;
				// Handle spotlight properties.
				lightDef.spot = lightDef.spot || {};
				lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== undefined ? lightDef.spot.innerConeAngle : 0;
				lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== undefined ? lightDef.spot.outerConeAngle : Math.PI / 4.0;
				lightNode.angle = lightDef.spot.outerConeAngle;
				lightNode.penumbra = 1.0 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
				lightNode.target.position.set( 0, 0, -1 );
				lightNode.add( lightNode.target );
				break;

			default:
				throw new Error( 'THREE.GLTFLoader: Unexpected light type: ' + lightDef.type );

		}

		// Some lights (e.g. spot) default to a position other than the origin. Reset the position
		// here, because node-level parsing will only override position if explicitly specified.
		lightNode.position.set( 0, 0, 0 );

		assignExtrasToUserData( lightNode, lightDef );

		if ( lightDef.intensity !== undefined ) lightNode.intensity = lightDef.intensity;

		lightNode.name = parser.createUniqueName( lightDef.name || ( 'light_' + lightIndex ) );

		dependency = Promise.resolve( lightNode );

		parser.cache.add( cacheKey, dependency );

		return dependency;

	}

	getDependency( type, index ) {

		if ( type !== 'light' ) return;

		return this._loadLight( index );

	}

	createNodeAttachment( nodeIndex ) {

		const self = this;
		const parser = this.parser;
		const json = parser.json;
		const nodeDef = json.nodes[ nodeIndex ];
		const lightDef = ( nodeDef.extensions && nodeDef.extensions[ this.name ] ) || {};
		const lightIndex = lightDef.light;

		if ( lightIndex === undefined ) return null;

		return this._loadLight( lightIndex ).then( function ( light ) {

			return parser._getNodeRef( self.cache, lightIndex, light );

		} );

	}

}

/**
 * Unlit Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit
 *
 * @private
 */
let GLTFMaterialsUnlitExtension$1 = class GLTFMaterialsUnlitExtension {

	constructor() {

		this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;

	}

	getMaterialType() {

		return MeshBasicMaterial;

	}

	extendParams( materialParams, materialDef, parser ) {

		const pending = [];

		materialParams.color = new Color( 1.0, 1.0, 1.0 );
		materialParams.opacity = 1.0;

		const metallicRoughness = materialDef.pbrMetallicRoughness;

		if ( metallicRoughness ) {

			if ( Array.isArray( metallicRoughness.baseColorFactor ) ) {

				const array = metallicRoughness.baseColorFactor;

				materialParams.color.setRGB( array[ 0 ], array[ 1 ], array[ 2 ], LinearSRGBColorSpace );
				materialParams.opacity = array[ 3 ];

			}

			if ( metallicRoughness.baseColorTexture !== undefined ) {

				pending.push( parser.assignTexture( materialParams, 'map', metallicRoughness.baseColorTexture, SRGBColorSpace ) );

			}

		}

		return Promise.all( pending );

	}

};

/**
 * Materials Emissive Strength Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/blob/5768b3ce0ef32bc39cdf1bef10b948586635ead3/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md
 *
 * @private
 */
let GLTFMaterialsEmissiveStrengthExtension$1 = class GLTFMaterialsEmissiveStrengthExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_EMISSIVE_STRENGTH;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const emissiveStrength = materialDef.extensions[ this.name ].emissiveStrength;

		if ( emissiveStrength !== undefined ) {

			materialParams.emissiveIntensity = emissiveStrength;

		}

		return Promise.resolve();

	}

};

/**
 * Clearcoat Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_clearcoat
 *
 * @private
 */
let GLTFMaterialsClearcoatExtension$1 = class GLTFMaterialsClearcoatExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_CLEARCOAT;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		if ( extension.clearcoatFactor !== undefined ) {

			materialParams.clearcoat = extension.clearcoatFactor;

		}

		if ( extension.clearcoatTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'clearcoatMap', extension.clearcoatTexture ) );

		}

		if ( extension.clearcoatRoughnessFactor !== undefined ) {

			materialParams.clearcoatRoughness = extension.clearcoatRoughnessFactor;

		}

		if ( extension.clearcoatRoughnessTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'clearcoatRoughnessMap', extension.clearcoatRoughnessTexture ) );

		}

		if ( extension.clearcoatNormalTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'clearcoatNormalMap', extension.clearcoatNormalTexture ) );

			if ( extension.clearcoatNormalTexture.scale !== undefined ) {

				const scale = extension.clearcoatNormalTexture.scale;

				materialParams.clearcoatNormalScale = new Vector2( scale, scale );

			}

		}

		return Promise.all( pending );

	}

};

/**
 * Materials dispersion Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_dispersion
 *
 * @private
 */
let GLTFMaterialsDispersionExtension$1 = class GLTFMaterialsDispersionExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_DISPERSION;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const extension = materialDef.extensions[ this.name ];

		materialParams.dispersion = extension.dispersion !== undefined ? extension.dispersion : 0;

		return Promise.resolve();

	}

};

/**
 * Iridescence Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_iridescence
 *
 * @private
 */
let GLTFMaterialsIridescenceExtension$1 = class GLTFMaterialsIridescenceExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_IRIDESCENCE;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		if ( extension.iridescenceFactor !== undefined ) {

			materialParams.iridescence = extension.iridescenceFactor;

		}

		if ( extension.iridescenceTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'iridescenceMap', extension.iridescenceTexture ) );

		}

		if ( extension.iridescenceIor !== undefined ) {

			materialParams.iridescenceIOR = extension.iridescenceIor;

		}

		if ( materialParams.iridescenceThicknessRange === undefined ) {

			materialParams.iridescenceThicknessRange = [ 100, 400 ];

		}

		if ( extension.iridescenceThicknessMinimum !== undefined ) {

			materialParams.iridescenceThicknessRange[ 0 ] = extension.iridescenceThicknessMinimum;

		}

		if ( extension.iridescenceThicknessMaximum !== undefined ) {

			materialParams.iridescenceThicknessRange[ 1 ] = extension.iridescenceThicknessMaximum;

		}

		if ( extension.iridescenceThicknessTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'iridescenceThicknessMap', extension.iridescenceThicknessTexture ) );

		}

		return Promise.all( pending );

	}

};

/**
 * Sheen Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen
 *
 * @private
 */
let GLTFMaterialsSheenExtension$1 = class GLTFMaterialsSheenExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_SHEEN;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		materialParams.sheenColor = new Color( 0, 0, 0 );
		materialParams.sheenRoughness = 0;
		materialParams.sheen = 1;

		const extension = materialDef.extensions[ this.name ];

		if ( extension.sheenColorFactor !== undefined ) {

			const colorFactor = extension.sheenColorFactor;
			materialParams.sheenColor.setRGB( colorFactor[ 0 ], colorFactor[ 1 ], colorFactor[ 2 ], LinearSRGBColorSpace );

		}

		if ( extension.sheenRoughnessFactor !== undefined ) {

			materialParams.sheenRoughness = extension.sheenRoughnessFactor;

		}

		if ( extension.sheenColorTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'sheenColorMap', extension.sheenColorTexture, SRGBColorSpace ) );

		}

		if ( extension.sheenRoughnessTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'sheenRoughnessMap', extension.sheenRoughnessTexture ) );

		}

		return Promise.all( pending );

	}

};

/**
 * Transmission Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_transmission
 * Draft: https://github.com/KhronosGroup/glTF/pull/1698
 *
 * @private
 */
let GLTFMaterialsTransmissionExtension$1 = class GLTFMaterialsTransmissionExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_TRANSMISSION;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		if ( extension.transmissionFactor !== undefined ) {

			materialParams.transmission = extension.transmissionFactor;

		}

		if ( extension.transmissionTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'transmissionMap', extension.transmissionTexture ) );

		}

		return Promise.all( pending );

	}

};

/**
 * Materials Volume Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_volume
 *
 * @private
 */
let GLTFMaterialsVolumeExtension$1 = class GLTFMaterialsVolumeExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_VOLUME;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		materialParams.thickness = extension.thicknessFactor !== undefined ? extension.thicknessFactor : 0;

		if ( extension.thicknessTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'thicknessMap', extension.thicknessTexture ) );

		}

		materialParams.attenuationDistance = extension.attenuationDistance || Infinity;

		const colorArray = extension.attenuationColor || [ 1, 1, 1 ];
		materialParams.attenuationColor = new Color().setRGB( colorArray[ 0 ], colorArray[ 1 ], colorArray[ 2 ], LinearSRGBColorSpace );

		return Promise.all( pending );

	}

};

/**
 * Materials ior Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_ior
 *
 * @private
 */
let GLTFMaterialsIorExtension$1 = class GLTFMaterialsIorExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_IOR;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const extension = materialDef.extensions[ this.name ];

		materialParams.ior = extension.ior !== undefined ? extension.ior : 1.5;

		return Promise.resolve();

	}

};

/**
 * Materials specular Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_specular
 *
 * @private
 */
let GLTFMaterialsSpecularExtension$1 = class GLTFMaterialsSpecularExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_SPECULAR;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		materialParams.specularIntensity = extension.specularFactor !== undefined ? extension.specularFactor : 1.0;

		if ( extension.specularTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'specularIntensityMap', extension.specularTexture ) );

		}

		const colorArray = extension.specularColorFactor || [ 1, 1, 1 ];
		materialParams.specularColor = new Color().setRGB( colorArray[ 0 ], colorArray[ 1 ], colorArray[ 2 ], LinearSRGBColorSpace );

		if ( extension.specularColorTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'specularColorMap', extension.specularColorTexture, SRGBColorSpace ) );

		}

		return Promise.all( pending );

	}

};


/**
 * Materials bump Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/EXT_materials_bump
 *
 * @private
 */
let GLTFMaterialsBumpExtension$1 = class GLTFMaterialsBumpExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.EXT_MATERIALS_BUMP;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		materialParams.bumpScale = extension.bumpFactor !== undefined ? extension.bumpFactor : 1.0;

		if ( extension.bumpTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'bumpMap', extension.bumpTexture ) );

		}

		return Promise.all( pending );

	}

};

/**
 * Materials anisotropy Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_anisotropy
 *
 * @private
 */
let GLTFMaterialsAnisotropyExtension$1 = class GLTFMaterialsAnisotropyExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_MATERIALS_ANISOTROPY;

	}

	getMaterialType( materialIndex ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) return null;

		return MeshPhysicalMaterial;

	}

	extendMaterialParams( materialIndex, materialParams ) {

		const parser = this.parser;
		const materialDef = parser.json.materials[ materialIndex ];

		if ( ! materialDef.extensions || ! materialDef.extensions[ this.name ] ) {

			return Promise.resolve();

		}

		const pending = [];

		const extension = materialDef.extensions[ this.name ];

		if ( extension.anisotropyStrength !== undefined ) {

			materialParams.anisotropy = extension.anisotropyStrength;

		}

		if ( extension.anisotropyRotation !== undefined ) {

			materialParams.anisotropyRotation = extension.anisotropyRotation;

		}

		if ( extension.anisotropyTexture !== undefined ) {

			pending.push( parser.assignTexture( materialParams, 'anisotropyMap', extension.anisotropyTexture ) );

		}

		return Promise.all( pending );

	}

};

/**
 * BasisU Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_basisu
 *
 * @private
 */
class GLTFTextureBasisUExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.KHR_TEXTURE_BASISU;

	}

	loadTexture( textureIndex ) {

		const parser = this.parser;
		const json = parser.json;

		const textureDef = json.textures[ textureIndex ];

		if ( ! textureDef.extensions || ! textureDef.extensions[ this.name ] ) {

			return null;

		}

		const extension = textureDef.extensions[ this.name ];
		const loader = parser.options.ktx2Loader;

		if ( ! loader ) {

			if ( json.extensionsRequired && json.extensionsRequired.indexOf( this.name ) >= 0 ) {

				throw new Error( 'THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures' );

			} else {

				// Assumes that the extension is optional and that a fallback texture is present
				return null;

			}

		}

		return parser.loadTextureImage( textureIndex, extension.source, loader );

	}

}

/**
 * WebP Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_texture_webp
 *
 * @private
 */
class GLTFTextureWebPExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.EXT_TEXTURE_WEBP;

	}

	loadTexture( textureIndex ) {

		const name = this.name;
		const parser = this.parser;
		const json = parser.json;

		const textureDef = json.textures[ textureIndex ];

		if ( ! textureDef.extensions || ! textureDef.extensions[ name ] ) {

			return null;

		}

		const extension = textureDef.extensions[ name ];
		const source = json.images[ extension.source ];

		let loader = parser.textureLoader;
		if ( source.uri ) {

			const handler = parser.options.manager.getHandler( source.uri );
			if ( handler !== null ) loader = handler;

		}

		return parser.loadTextureImage( textureIndex, extension.source, loader );

	}

}

/**
 * AVIF Texture Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_texture_avif
 *
 * @private
 */
class GLTFTextureAVIFExtension {

	constructor( parser ) {

		this.parser = parser;
		this.name = EXTENSIONS.EXT_TEXTURE_AVIF;

	}

	loadTexture( textureIndex ) {

		const name = this.name;
		const parser = this.parser;
		const json = parser.json;

		const textureDef = json.textures[ textureIndex ];

		if ( ! textureDef.extensions || ! textureDef.extensions[ name ] ) {

			return null;

		}

		const extension = textureDef.extensions[ name ];
		const source = json.images[ extension.source ];

		let loader = parser.textureLoader;
		if ( source.uri ) {

			const handler = parser.options.manager.getHandler( source.uri );
			if ( handler !== null ) loader = handler;

		}

		return parser.loadTextureImage( textureIndex, extension.source, loader );

	}

}

/**
 * meshopt BufferView Compression Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_meshopt_compression
 *
 * @private
 */
class GLTFMeshoptCompression {

	constructor( parser ) {

		this.name = EXTENSIONS.EXT_MESHOPT_COMPRESSION;
		this.parser = parser;

	}

	loadBufferView( index ) {

		const json = this.parser.json;
		const bufferView = json.bufferViews[ index ];

		if ( bufferView.extensions && bufferView.extensions[ this.name ] ) {

			const extensionDef = bufferView.extensions[ this.name ];

			const buffer = this.parser.getDependency( 'buffer', extensionDef.buffer );
			const decoder = this.parser.options.meshoptDecoder;

			if ( ! decoder || ! decoder.supported ) {

				if ( json.extensionsRequired && json.extensionsRequired.indexOf( this.name ) >= 0 ) {

					throw new Error( 'THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files' );

				} else {

					// Assumes that the extension is optional and that fallback buffer data is present
					return null;

				}

			}

			return buffer.then( function ( res ) {

				const byteOffset = extensionDef.byteOffset || 0;
				const byteLength = extensionDef.byteLength || 0;

				const count = extensionDef.count;
				const stride = extensionDef.byteStride;

				const source = new Uint8Array( res, byteOffset, byteLength );

				if ( decoder.decodeGltfBufferAsync ) {

					return decoder.decodeGltfBufferAsync( count, stride, source, extensionDef.mode, extensionDef.filter ).then( function ( res ) {

						return res.buffer;

					} );

				} else {

					// Support for MeshoptDecoder 0.18 or earlier, without decodeGltfBufferAsync
					return decoder.ready.then( function () {

						const result = new ArrayBuffer( count * stride );
						decoder.decodeGltfBuffer( new Uint8Array( result ), count, stride, source, extensionDef.mode, extensionDef.filter );
						return result;

					} );

				}

			} );

		} else {

			return null;

		}

	}

}

/**
 * GPU Instancing Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_mesh_gpu_instancing
 *
 * @private
 */
let GLTFMeshGpuInstancing$1 = class GLTFMeshGpuInstancing {

	constructor( parser ) {

		this.name = EXTENSIONS.EXT_MESH_GPU_INSTANCING;
		this.parser = parser;

	}

	createNodeMesh( nodeIndex ) {

		const json = this.parser.json;
		const nodeDef = json.nodes[ nodeIndex ];

		if ( ! nodeDef.extensions || ! nodeDef.extensions[ this.name ] ||
			nodeDef.mesh === undefined ) {

			return null;

		}

		const meshDef = json.meshes[ nodeDef.mesh ];

		// No Points or Lines + Instancing support yet

		for ( const primitive of meshDef.primitives ) {

			if ( primitive.mode !== WEBGL_CONSTANTS$1.TRIANGLES &&
				 primitive.mode !== WEBGL_CONSTANTS$1.TRIANGLE_STRIP &&
				 primitive.mode !== WEBGL_CONSTANTS$1.TRIANGLE_FAN &&
				 primitive.mode !== undefined ) {

				return null;

			}

		}

		const extensionDef = nodeDef.extensions[ this.name ];
		const attributesDef = extensionDef.attributes;

		// @TODO: Can we support InstancedMesh + SkinnedMesh?

		const pending = [];
		const attributes = {};

		for ( const key in attributesDef ) {

			pending.push( this.parser.getDependency( 'accessor', attributesDef[ key ] ).then( accessor => {

				attributes[ key ] = accessor;
				return attributes[ key ];

			} ) );

		}

		if ( pending.length < 1 ) {

			return null;

		}

		pending.push( this.parser.createNodeMesh( nodeIndex ) );

		return Promise.all( pending ).then( results => {

			const nodeObject = results.pop();
			const meshes = nodeObject.isGroup ? nodeObject.children : [ nodeObject ];
			const count = results[ 0 ].count; // All attribute counts should be same
			const instancedMeshes = [];

			for ( const mesh of meshes ) {

				// Temporal variables
				const m = new Matrix4();
				const p = new Vector3();
				const q = new Quaternion();
				const s = new Vector3( 1, 1, 1 );

				const instancedMesh = new InstancedMesh( mesh.geometry, mesh.material, count );

				for ( let i = 0; i < count; i ++ ) {

					if ( attributes.TRANSLATION ) {

						p.fromBufferAttribute( attributes.TRANSLATION, i );

					}

					if ( attributes.ROTATION ) {

						q.fromBufferAttribute( attributes.ROTATION, i );

					}

					if ( attributes.SCALE ) {

						s.fromBufferAttribute( attributes.SCALE, i );

					}

					instancedMesh.setMatrixAt( i, m.compose( p, q, s ) );

				}

				// Add instance attributes to the geometry, excluding TRS.
				for ( const attributeName in attributes ) {

					if ( attributeName === '_COLOR_0' ) {

						const attr = attributes[ attributeName ];
						instancedMesh.instanceColor = new InstancedBufferAttribute( attr.array, attr.itemSize, attr.normalized );

					} else if ( attributeName !== 'TRANSLATION' &&
						 attributeName !== 'ROTATION' &&
						 attributeName !== 'SCALE' ) {

						mesh.geometry.setAttribute( attributeName, attributes[ attributeName ] );

					}

				}

				// Just in case
				Object3D.prototype.copy.call( instancedMesh, mesh );

				this.parser.assignFinalMaterial( instancedMesh );

				instancedMeshes.push( instancedMesh );

			}

			if ( nodeObject.isGroup ) {

				nodeObject.clear();

				nodeObject.add( ... instancedMeshes );

				return nodeObject;

			}

			return instancedMeshes[ 0 ];

		} );

	}

};

/* BINARY EXTENSION */
const BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
const BINARY_EXTENSION_HEADER_LENGTH = 12;
const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };

class GLTFBinaryExtension {

	constructor( data ) {

		this.name = EXTENSIONS.KHR_BINARY_GLTF;
		this.content = null;
		this.body = null;

		const headerView = new DataView( data, 0, BINARY_EXTENSION_HEADER_LENGTH );
		const textDecoder = new TextDecoder();

		this.header = {
			magic: textDecoder.decode( new Uint8Array( data.slice( 0, 4 ) ) ),
			version: headerView.getUint32( 4, true ),
			length: headerView.getUint32( 8, true )
		};

		if ( this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC ) {

			throw new Error( 'THREE.GLTFLoader: Unsupported glTF-Binary header.' );

		} else if ( this.header.version < 2.0 ) {

			throw new Error( 'THREE.GLTFLoader: Legacy binary file detected.' );

		}

		const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
		const chunkView = new DataView( data, BINARY_EXTENSION_HEADER_LENGTH );
		let chunkIndex = 0;

		while ( chunkIndex < chunkContentsLength ) {

			const chunkLength = chunkView.getUint32( chunkIndex, true );
			chunkIndex += 4;

			const chunkType = chunkView.getUint32( chunkIndex, true );
			chunkIndex += 4;

			if ( chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON ) {

				const contentArray = new Uint8Array( data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength );
				this.content = textDecoder.decode( contentArray );

			} else if ( chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN ) {

				const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
				this.body = data.slice( byteOffset, byteOffset + chunkLength );

			}

			// Clients must ignore chunks with unknown types.

			chunkIndex += chunkLength;

		}

		if ( this.content === null ) {

			throw new Error( 'THREE.GLTFLoader: JSON content not found.' );

		}

	}

}

/**
 * DRACO Mesh Compression Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_draco_mesh_compression
 *
 * @private
 */
class GLTFDracoMeshCompressionExtension {

	constructor( json, dracoLoader ) {

		if ( ! dracoLoader ) {

			throw new Error( 'THREE.GLTFLoader: No DRACOLoader instance provided.' );

		}

		this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
		this.json = json;
		this.dracoLoader = dracoLoader;
		this.dracoLoader.preload();

	}

	decodePrimitive( primitive, parser ) {

		const json = this.json;
		const dracoLoader = this.dracoLoader;
		const bufferViewIndex = primitive.extensions[ this.name ].bufferView;
		const gltfAttributeMap = primitive.extensions[ this.name ].attributes;
		const threeAttributeMap = {};
		const attributeNormalizedMap = {};
		const attributeTypeMap = {};

		for ( const attributeName in gltfAttributeMap ) {

			const threeAttributeName = ATTRIBUTES[ attributeName ] || attributeName.toLowerCase();

			threeAttributeMap[ threeAttributeName ] = gltfAttributeMap[ attributeName ];

		}

		for ( const attributeName in primitive.attributes ) {

			const threeAttributeName = ATTRIBUTES[ attributeName ] || attributeName.toLowerCase();

			if ( gltfAttributeMap[ attributeName ] !== undefined ) {

				const accessorDef = json.accessors[ primitive.attributes[ attributeName ] ];
				const componentType = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];

				attributeTypeMap[ threeAttributeName ] = componentType.name;
				attributeNormalizedMap[ threeAttributeName ] = accessorDef.normalized === true;

			}

		}

		return parser.getDependency( 'bufferView', bufferViewIndex ).then( function ( bufferView ) {

			return new Promise( function ( resolve, reject ) {

				dracoLoader.decodeDracoFile( bufferView, function ( geometry ) {

					for ( const attributeName in geometry.attributes ) {

						const attribute = geometry.attributes[ attributeName ];
						const normalized = attributeNormalizedMap[ attributeName ];

						if ( normalized !== undefined ) attribute.normalized = normalized;

					}

					resolve( geometry );

				}, threeAttributeMap, attributeTypeMap, LinearSRGBColorSpace, reject );

			} );

		} );

	}

}

/**
 * Texture Transform Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_texture_transform
 *
 * @private
 */
class GLTFTextureTransformExtension {

	constructor() {

		this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;

	}

	extendTexture( texture, transform ) {

		if ( ( transform.texCoord === undefined || transform.texCoord === texture.channel )
			&& transform.offset === undefined
			&& transform.rotation === undefined
			&& transform.scale === undefined ) {

			// See https://github.com/mrdoob/three.js/issues/21819.
			return texture;

		}

		texture = texture.clone();

		if ( transform.texCoord !== undefined ) {

			texture.channel = transform.texCoord;

		}

		if ( transform.offset !== undefined ) {

			texture.offset.fromArray( transform.offset );

		}

		if ( transform.rotation !== undefined ) {

			texture.rotation = transform.rotation;

		}

		if ( transform.scale !== undefined ) {

			texture.repeat.fromArray( transform.scale );

		}

		texture.needsUpdate = true;

		return texture;

	}

}

/**
 * Mesh Quantization Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization
 *
 * @private
 */
class GLTFMeshQuantizationExtension {

	constructor() {

		this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;

	}

}

/*********************************/
/********** INTERPOLATION ********/
/*********************************/

// Spline Interpolation
// Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#appendix-c-spline-interpolation
class GLTFCubicSplineInterpolant extends Interpolant {

	constructor( parameterPositions, sampleValues, sampleSize, resultBuffer ) {

		super( parameterPositions, sampleValues, sampleSize, resultBuffer );

	}

	copySampleValue_( index ) {

		// Copies a sample value to the result buffer. See description of glTF
		// CUBICSPLINE values layout in interpolate_() function below.

		const result = this.resultBuffer,
			values = this.sampleValues,
			valueSize = this.valueSize,
			offset = index * valueSize * 3 + valueSize;

		for ( let i = 0; i !== valueSize; i ++ ) {

			result[ i ] = values[ offset + i ];

		}

		return result;

	}

	interpolate_( i1, t0, t, t1 ) {

		const result = this.resultBuffer;
		const values = this.sampleValues;
		const stride = this.valueSize;

		const stride2 = stride * 2;
		const stride3 = stride * 3;

		const td = t1 - t0;

		const p = ( t - t0 ) / td;
		const pp = p * p;
		const ppp = pp * p;

		const offset1 = i1 * stride3;
		const offset0 = offset1 - stride3;

		const s2 = -2 * ppp + 3 * pp;
		const s3 = ppp - pp;
		const s0 = 1 - s2;
		const s1 = s3 - pp + p;

		// Layout of keyframe output values for CUBICSPLINE animations:
		//   [ inTangent_1, splineVertex_1, outTangent_1, inTangent_2, splineVertex_2, ... ]
		for ( let i = 0; i !== stride; i ++ ) {

			const p0 = values[ offset0 + i + stride ]; // splineVertex_k
			const m0 = values[ offset0 + i + stride2 ] * td; // outTangent_k * (t_k+1 - t_k)
			const p1 = values[ offset1 + i + stride ]; // splineVertex_k+1
			const m1 = values[ offset1 + i ] * td; // inTangent_k+1 * (t_k+1 - t_k)

			result[ i ] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;

		}

		return result;

	}

}

const _quaternion = new Quaternion();

class GLTFCubicSplineQuaternionInterpolant extends GLTFCubicSplineInterpolant {

	interpolate_( i1, t0, t, t1 ) {

		const result = super.interpolate_( i1, t0, t, t1 );

		_quaternion.fromArray( result ).normalize().toArray( result );

		return result;

	}

}


/*********************************/
/********** INTERNALS ************/
/*********************************/

/* CONSTANTS */

const WEBGL_CONSTANTS$1 = {
	POINTS: 0,
	LINES: 1,
	LINE_LOOP: 2,
	LINE_STRIP: 3,
	TRIANGLES: 4,
	TRIANGLE_STRIP: 5,
	TRIANGLE_FAN: 6};

const WEBGL_COMPONENT_TYPES = {
	5120: Int8Array,
	5121: Uint8Array,
	5122: Int16Array,
	5123: Uint16Array,
	5125: Uint32Array,
	5126: Float32Array
};

const WEBGL_FILTERS = {
	9728: NearestFilter,
	9729: LinearFilter,
	9984: NearestMipmapNearestFilter,
	9985: LinearMipmapNearestFilter,
	9986: NearestMipmapLinearFilter,
	9987: LinearMipmapLinearFilter
};

const WEBGL_WRAPPINGS = {
	33071: ClampToEdgeWrapping,
	33648: MirroredRepeatWrapping,
	10497: RepeatWrapping
};

const WEBGL_TYPE_SIZES = {
	'SCALAR': 1,
	'VEC2': 2,
	'VEC3': 3,
	'VEC4': 4,
	'MAT2': 4,
	'MAT3': 9,
	'MAT4': 16
};

const ATTRIBUTES = {
	POSITION: 'position',
	NORMAL: 'normal',
	TANGENT: 'tangent',
	TEXCOORD_0: 'uv',
	TEXCOORD_1: 'uv1',
	TEXCOORD_2: 'uv2',
	TEXCOORD_3: 'uv3',
	COLOR_0: 'color',
	WEIGHTS_0: 'skinWeight',
	JOINTS_0: 'skinIndex',
};

const PATH_PROPERTIES$1 = {
	scale: 'scale',
	translation: 'position',
	rotation: 'quaternion',
	weights: 'morphTargetInfluences'
};

const INTERPOLATION = {
	CUBICSPLINE: undefined, // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
		                        // keyframe track will be initialized with a default interpolation type, then modified.
	LINEAR: InterpolateLinear,
	STEP: InterpolateDiscrete
};

const ALPHA_MODES = {
	OPAQUE: 'OPAQUE',
	MASK: 'MASK',
	BLEND: 'BLEND'
};

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#default-material
 *
 * @private
 * @param {Object<string, Material>} cache
 * @return {Material}
 */
function createDefaultMaterial( cache ) {

	if ( cache[ 'DefaultMaterial' ] === undefined ) {

		cache[ 'DefaultMaterial' ] = new MeshStandardMaterial( {
			color: 0xFFFFFF,
			emissive: 0x000000,
			metalness: 1,
			roughness: 1,
			transparent: false,
			depthTest: true,
			side: FrontSide
		} );

	}

	return cache[ 'DefaultMaterial' ];

}

function addUnknownExtensionsToUserData( knownExtensions, object, objectDef ) {

	// Add unknown glTF extensions to an object's userData.

	for ( const name in objectDef.extensions ) {

		if ( knownExtensions[ name ] === undefined ) {

			object.userData.gltfExtensions = object.userData.gltfExtensions || {};
			object.userData.gltfExtensions[ name ] = objectDef.extensions[ name ];

		}

	}

}

/**
 *
 * @private
 * @param {Object3D|Material|BufferGeometry|Object|AnimationClip} object
 * @param {GLTF.definition} gltfDef
 */
function assignExtrasToUserData( object, gltfDef ) {

	if ( gltfDef.extras !== undefined ) {

		if ( typeof gltfDef.extras === 'object' ) {

			Object.assign( object.userData, gltfDef.extras );

		} else {

			console.warn( 'THREE.GLTFLoader: Ignoring primitive type .extras, ' + gltfDef.extras );

		}

	}

}

/**
 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#morph-targets
 *
 * @private
 * @param {BufferGeometry} geometry
 * @param {Array<GLTF.Target>} targets
 * @param {GLTFParser} parser
 * @return {Promise<BufferGeometry>}
 */
function addMorphTargets( geometry, targets, parser ) {

	let hasMorphPosition = false;
	let hasMorphNormal = false;
	let hasMorphColor = false;

	for ( let i = 0, il = targets.length; i < il; i ++ ) {

		const target = targets[ i ];

		if ( target.POSITION !== undefined ) hasMorphPosition = true;
		if ( target.NORMAL !== undefined ) hasMorphNormal = true;
		if ( target.COLOR_0 !== undefined ) hasMorphColor = true;

		if ( hasMorphPosition && hasMorphNormal && hasMorphColor ) break;

	}

	if ( ! hasMorphPosition && ! hasMorphNormal && ! hasMorphColor ) return Promise.resolve( geometry );

	const pendingPositionAccessors = [];
	const pendingNormalAccessors = [];
	const pendingColorAccessors = [];

	for ( let i = 0, il = targets.length; i < il; i ++ ) {

		const target = targets[ i ];

		if ( hasMorphPosition ) {

			const pendingAccessor = target.POSITION !== undefined
				? parser.getDependency( 'accessor', target.POSITION )
				: geometry.attributes.position;

			pendingPositionAccessors.push( pendingAccessor );

		}

		if ( hasMorphNormal ) {

			const pendingAccessor = target.NORMAL !== undefined
				? parser.getDependency( 'accessor', target.NORMAL )
				: geometry.attributes.normal;

			pendingNormalAccessors.push( pendingAccessor );

		}

		if ( hasMorphColor ) {

			const pendingAccessor = target.COLOR_0 !== undefined
				? parser.getDependency( 'accessor', target.COLOR_0 )
				: geometry.attributes.color;

			pendingColorAccessors.push( pendingAccessor );

		}

	}

	return Promise.all( [
		Promise.all( pendingPositionAccessors ),
		Promise.all( pendingNormalAccessors ),
		Promise.all( pendingColorAccessors )
	] ).then( function ( accessors ) {

		const morphPositions = accessors[ 0 ];
		const morphNormals = accessors[ 1 ];
		const morphColors = accessors[ 2 ];

		if ( hasMorphPosition ) geometry.morphAttributes.position = morphPositions;
		if ( hasMorphNormal ) geometry.morphAttributes.normal = morphNormals;
		if ( hasMorphColor ) geometry.morphAttributes.color = morphColors;
		geometry.morphTargetsRelative = true;

		return geometry;

	} );

}

/**
 *
 * @private
 * @param {Mesh} mesh
 * @param {GLTF.Mesh} meshDef
 */
function updateMorphTargets( mesh, meshDef ) {

	mesh.updateMorphTargets();

	if ( meshDef.weights !== undefined ) {

		for ( let i = 0, il = meshDef.weights.length; i < il; i ++ ) {

			mesh.morphTargetInfluences[ i ] = meshDef.weights[ i ];

		}

	}

	// .extras has user-defined data, so check that .extras.targetNames is an array.
	if ( meshDef.extras && Array.isArray( meshDef.extras.targetNames ) ) {

		const targetNames = meshDef.extras.targetNames;

		if ( mesh.morphTargetInfluences.length === targetNames.length ) {

			mesh.morphTargetDictionary = {};

			for ( let i = 0, il = targetNames.length; i < il; i ++ ) {

				mesh.morphTargetDictionary[ targetNames[ i ] ] = i;

			}

		} else {

			console.warn( 'THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.' );

		}

	}

}

function createPrimitiveKey( primitiveDef ) {

	let geometryKey;

	const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ];

	if ( dracoExtension ) {

		geometryKey = 'draco:' + dracoExtension.bufferView
				+ ':' + dracoExtension.indices
				+ ':' + createAttributesKey( dracoExtension.attributes );

	} else {

		geometryKey = primitiveDef.indices + ':' + createAttributesKey( primitiveDef.attributes ) + ':' + primitiveDef.mode;

	}

	if ( primitiveDef.targets !== undefined ) {

		for ( let i = 0, il = primitiveDef.targets.length; i < il; i ++ ) {

			geometryKey += ':' + createAttributesKey( primitiveDef.targets[ i ] );

		}

	}

	return geometryKey;

}

function createAttributesKey( attributes ) {

	let attributesKey = '';

	const keys = Object.keys( attributes ).sort();

	for ( let i = 0, il = keys.length; i < il; i ++ ) {

		attributesKey += keys[ i ] + ':' + attributes[ keys[ i ] ] + ';';

	}

	return attributesKey;

}

function getNormalizedComponentScale( constructor ) {

	// Reference:
	// https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#encoding-quantized-data

	switch ( constructor ) {

		case Int8Array:
			return 1 / 127;

		case Uint8Array:
			return 1 / 255;

		case Int16Array:
			return 1 / 32767;

		case Uint16Array:
			return 1 / 65535;

		default:
			throw new Error( 'THREE.GLTFLoader: Unsupported normalized accessor component type.' );

	}

}

function getImageURIMimeType( uri ) {

	if ( uri.search( /\.jpe?g($|\?)/i ) > 0 || uri.search( /^data\:image\/jpeg/ ) === 0 ) return 'image/jpeg';
	if ( uri.search( /\.webp($|\?)/i ) > 0 || uri.search( /^data\:image\/webp/ ) === 0 ) return 'image/webp';
	if ( uri.search( /\.ktx2($|\?)/i ) > 0 || uri.search( /^data\:image\/ktx2/ ) === 0 ) return 'image/ktx2';

	return 'image/png';

}

const _identityMatrix = new Matrix4();

/* GLTF PARSER */

class GLTFParser {

	constructor( json = {}, options = {} ) {

		this.json = json;
		this.extensions = {};
		this.plugins = {};
		this.options = options;

		// loader object cache
		this.cache = new GLTFRegistry();

		// associations between Three.js objects and glTF elements
		this.associations = new Map();

		// BufferGeometry caching
		this.primitiveCache = {};

		// Node cache
		this.nodeCache = {};

		// Object3D instance caches
		this.meshCache = { refs: {}, uses: {} };
		this.cameraCache = { refs: {}, uses: {} };
		this.lightCache = { refs: {}, uses: {} };

		this.sourceCache = {};
		this.textureCache = {};

		// Track node names, to ensure no duplicates
		this.nodeNamesUsed = {};

		// Use an ImageBitmapLoader if imageBitmaps are supported. Moves much of the
		// expensive work of uploading a texture to the GPU off the main thread.

		let isSafari = false;
		let safariVersion = -1;
		let isFirefox = false;
		let firefoxVersion = -1;

		if ( typeof navigator !== 'undefined' ) {

			const userAgent = navigator.userAgent;

			isSafari = /^((?!chrome|android).)*safari/i.test( userAgent ) === true;
			const safariMatch = userAgent.match( /Version\/(\d+)/ );
			safariVersion = isSafari && safariMatch ? parseInt( safariMatch[ 1 ], 10 ) : -1;

			isFirefox = userAgent.indexOf( 'Firefox' ) > -1;
			firefoxVersion = isFirefox ? userAgent.match( /Firefox\/([0-9]+)\./ )[ 1 ] : -1;

		}

		if ( typeof createImageBitmap === 'undefined' || ( isSafari && safariVersion < 17 ) || ( isFirefox && firefoxVersion < 98 ) ) {

			this.textureLoader = new TextureLoader( this.options.manager );

		} else {

			this.textureLoader = new ImageBitmapLoader( this.options.manager );

		}

		this.textureLoader.setCrossOrigin( this.options.crossOrigin );
		this.textureLoader.setRequestHeader( this.options.requestHeader );

		this.fileLoader = new FileLoader( this.options.manager );
		this.fileLoader.setResponseType( 'arraybuffer' );

		if ( this.options.crossOrigin === 'use-credentials' ) {

			this.fileLoader.setWithCredentials( true );

		}

	}

	setExtensions( extensions ) {

		this.extensions = extensions;

	}

	setPlugins( plugins ) {

		this.plugins = plugins;

	}

	parse( onLoad, onError ) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;

		// Clear the loader cache
		this.cache.removeAll();
		this.nodeCache = {};

		// Mark the special nodes/meshes in json for efficient parse
		this._invokeAll( function ( ext ) {

			return ext._markDefs && ext._markDefs();

		} );

		Promise.all( this._invokeAll( function ( ext ) {

			return ext.beforeRoot && ext.beforeRoot();

		} ) ).then( function () {

			return Promise.all( [

				parser.getDependencies( 'scene' ),
				parser.getDependencies( 'animation' ),
				parser.getDependencies( 'camera' ),

			] );

		} ).then( function ( dependencies ) {

			const result = {
				scene: dependencies[ 0 ][ json.scene || 0 ],
				scenes: dependencies[ 0 ],
				animations: dependencies[ 1 ],
				cameras: dependencies[ 2 ],
				asset: json.asset,
				parser: parser,
				userData: {}
			};

			addUnknownExtensionsToUserData( extensions, result, json );

			assignExtrasToUserData( result, json );

			return Promise.all( parser._invokeAll( function ( ext ) {

				return ext.afterRoot && ext.afterRoot( result );

			} ) ).then( function () {

				for ( const scene of result.scenes ) {

					scene.updateMatrixWorld();

				}

				onLoad( result );

			} );

		} ).catch( onError );

	}

	/**
	 * Marks the special nodes/meshes in json for efficient parse.
	 *
	 * @private
	 */
	_markDefs() {

		const nodeDefs = this.json.nodes || [];
		const skinDefs = this.json.skins || [];
		const meshDefs = this.json.meshes || [];

		// Nothing in the node definition indicates whether it is a Bone or an
		// Object3D. Use the skins' joint references to mark bones.
		for ( let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex ++ ) {

			const joints = skinDefs[ skinIndex ].joints;

			for ( let i = 0, il = joints.length; i < il; i ++ ) {

				nodeDefs[ joints[ i ] ].isBone = true;

			}

		}

		// Iterate over all nodes, marking references to shared resources,
		// as well as skeleton joints.
		for ( let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex ++ ) {

			const nodeDef = nodeDefs[ nodeIndex ];

			if ( nodeDef.mesh !== undefined ) {

				this._addNodeRef( this.meshCache, nodeDef.mesh );

				// Nothing in the mesh definition indicates whether it is
				// a SkinnedMesh or Mesh. Use the node's mesh reference
				// to mark SkinnedMesh if node has skin.
				if ( nodeDef.skin !== undefined ) {

					meshDefs[ nodeDef.mesh ].isSkinnedMesh = true;

				}

			}

			if ( nodeDef.camera !== undefined ) {

				this._addNodeRef( this.cameraCache, nodeDef.camera );

			}

		}

	}

	/**
	 * Counts references to shared node / Object3D resources. These resources
	 * can be reused, or "instantiated", at multiple nodes in the scene
	 * hierarchy. Mesh, Camera, and Light instances are instantiated and must
	 * be marked. Non-scenegraph resources (like Materials, Geometries, and
	 * Textures) can be reused directly and are not marked here.
	 *
	 * Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
	 *
	 * @private
	 * @param {Object} cache
	 * @param {Object3D} index
	 */
	_addNodeRef( cache, index ) {

		if ( index === undefined ) return;

		if ( cache.refs[ index ] === undefined ) {

			cache.refs[ index ] = cache.uses[ index ] = 0;

		}

		cache.refs[ index ] ++;

	}

	/**
	 * Returns a reference to a shared resource, cloning it if necessary.
	 *
	 * @private
	 * @param {Object} cache
	 * @param {number} index
	 * @param {Object} object
	 * @return {Object}
	 */
	_getNodeRef( cache, index, object ) {

		if ( cache.refs[ index ] <= 1 ) return object;

		const ref = object.clone();

		// Propagates mappings to the cloned object, prevents mappings on the
		// original object from being lost.
		const updateMappings = ( original, clone ) => {

			const mappings = this.associations.get( original );
			if ( mappings != null ) {

				this.associations.set( clone, mappings );

			}

			for ( const [ i, child ] of original.children.entries() ) {

				updateMappings( child, clone.children[ i ] );

			}

		};

		updateMappings( object, ref );

		ref.name += '_instance_' + ( cache.uses[ index ] ++ );

		return ref;

	}

	_invokeOne( func ) {

		const extensions = Object.values( this.plugins );
		extensions.push( this );

		for ( let i = 0; i < extensions.length; i ++ ) {

			const result = func( extensions[ i ] );

			if ( result ) return result;

		}

		return null;

	}

	_invokeAll( func ) {

		const extensions = Object.values( this.plugins );
		extensions.unshift( this );

		const pending = [];

		for ( let i = 0; i < extensions.length; i ++ ) {

			const result = func( extensions[ i ] );

			if ( result ) pending.push( result );

		}

		return pending;

	}

	/**
	 * Requests the specified dependency asynchronously, with caching.
	 *
	 * @private
	 * @param {string} type
	 * @param {number} index
	 * @return {Promise<Object3D|Material|Texture|AnimationClip|ArrayBuffer|Object>}
	 */
	getDependency( type, index ) {

		const cacheKey = type + ':' + index;
		let dependency = this.cache.get( cacheKey );

		if ( ! dependency ) {

			switch ( type ) {

				case 'scene':
					dependency = this.loadScene( index );
					break;

				case 'node':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadNode && ext.loadNode( index );

					} );
					break;

				case 'mesh':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadMesh && ext.loadMesh( index );

					} );
					break;

				case 'accessor':
					dependency = this.loadAccessor( index );
					break;

				case 'bufferView':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadBufferView && ext.loadBufferView( index );

					} );
					break;

				case 'buffer':
					dependency = this.loadBuffer( index );
					break;

				case 'material':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadMaterial && ext.loadMaterial( index );

					} );
					break;

				case 'texture':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadTexture && ext.loadTexture( index );

					} );
					break;

				case 'skin':
					dependency = this.loadSkin( index );
					break;

				case 'animation':
					dependency = this._invokeOne( function ( ext ) {

						return ext.loadAnimation && ext.loadAnimation( index );

					} );
					break;

				case 'camera':
					dependency = this.loadCamera( index );
					break;

				default:
					dependency = this._invokeOne( function ( ext ) {

						return ext != this && ext.getDependency && ext.getDependency( type, index );

					} );

					if ( ! dependency ) {

						throw new Error( 'Unknown type: ' + type );

					}

					break;

			}

			this.cache.add( cacheKey, dependency );

		}

		return dependency;

	}

	/**
	 * Requests all dependencies of the specified type asynchronously, with caching.
	 *
	 * @private
	 * @param {string} type
	 * @return {Promise<Array<Object>>}
	 */
	getDependencies( type ) {

		let dependencies = this.cache.get( type );

		if ( ! dependencies ) {

			const parser = this;
			const defs = this.json[ type + ( type === 'mesh' ? 'es' : 's' ) ] || [];

			dependencies = Promise.all( defs.map( function ( def, index ) {

				return parser.getDependency( type, index );

			} ) );

			this.cache.add( type, dependencies );

		}

		return dependencies;

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
	 *
	 * @private
	 * @param {number} bufferIndex
	 * @return {Promise<ArrayBuffer>}
	 */
	loadBuffer( bufferIndex ) {

		const bufferDef = this.json.buffers[ bufferIndex ];
		const loader = this.fileLoader;

		if ( bufferDef.type && bufferDef.type !== 'arraybuffer' ) {

			throw new Error( 'THREE.GLTFLoader: ' + bufferDef.type + ' buffer type is not supported.' );

		}

		// If present, GLB container is required to be the first buffer.
		if ( bufferDef.uri === undefined && bufferIndex === 0 ) {

			return Promise.resolve( this.extensions[ EXTENSIONS.KHR_BINARY_GLTF ].body );

		}

		const options = this.options;

		return new Promise( function ( resolve, reject ) {

			loader.load( LoaderUtils.resolveURL( bufferDef.uri, options.path ), resolve, undefined, function () {

				reject( new Error( 'THREE.GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".' ) );

			} );

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
	 *
	 * @private
	 * @param {number} bufferViewIndex
	 * @return {Promise<ArrayBuffer>}
	 */
	loadBufferView( bufferViewIndex ) {

		const bufferViewDef = this.json.bufferViews[ bufferViewIndex ];

		return this.getDependency( 'buffer', bufferViewDef.buffer ).then( function ( buffer ) {

			const byteLength = bufferViewDef.byteLength || 0;
			const byteOffset = bufferViewDef.byteOffset || 0;
			return buffer.slice( byteOffset, byteOffset + byteLength );

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#accessors
	 *
	 * @private
	 * @param {number} accessorIndex
	 * @return {Promise<BufferAttribute|InterleavedBufferAttribute>}
	 */
	loadAccessor( accessorIndex ) {

		const parser = this;
		const json = this.json;

		const accessorDef = this.json.accessors[ accessorIndex ];

		if ( accessorDef.bufferView === undefined && accessorDef.sparse === undefined ) {

			const itemSize = WEBGL_TYPE_SIZES[ accessorDef.type ];
			const TypedArray = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];
			const normalized = accessorDef.normalized === true;

			const array = new TypedArray( accessorDef.count * itemSize );
			return Promise.resolve( new BufferAttribute( array, itemSize, normalized ) );

		}

		const pendingBufferViews = [];

		if ( accessorDef.bufferView !== undefined ) {

			pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.bufferView ) );

		} else {

			pendingBufferViews.push( null );

		}

		if ( accessorDef.sparse !== undefined ) {

			pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.sparse.indices.bufferView ) );
			pendingBufferViews.push( this.getDependency( 'bufferView', accessorDef.sparse.values.bufferView ) );

		}

		return Promise.all( pendingBufferViews ).then( function ( bufferViews ) {

			const bufferView = bufferViews[ 0 ];

			const itemSize = WEBGL_TYPE_SIZES[ accessorDef.type ];
			const TypedArray = WEBGL_COMPONENT_TYPES[ accessorDef.componentType ];

			// For VEC3: itemSize is 3, elementBytes is 4, itemBytes is 12.
			const elementBytes = TypedArray.BYTES_PER_ELEMENT;
			const itemBytes = elementBytes * itemSize;
			const byteOffset = accessorDef.byteOffset || 0;
			const byteStride = accessorDef.bufferView !== undefined ? json.bufferViews[ accessorDef.bufferView ].byteStride : undefined;
			const normalized = accessorDef.normalized === true;
			let array, bufferAttribute;

			// The buffer is not interleaved if the stride is the item size in bytes.
			if ( byteStride && byteStride !== itemBytes ) {

				// Each "slice" of the buffer, as defined by 'count' elements of 'byteStride' bytes, gets its own InterleavedBuffer
				// This makes sure that IBA.count reflects accessor.count properly
				const ibSlice = Math.floor( byteOffset / byteStride );
				const ibCacheKey = 'InterleavedBuffer:' + accessorDef.bufferView + ':' + accessorDef.componentType + ':' + ibSlice + ':' + accessorDef.count;
				let ib = parser.cache.get( ibCacheKey );

				if ( ! ib ) {

					array = new TypedArray( bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes );

					// Integer parameters to IB/IBA are in array elements, not bytes.
					ib = new InterleavedBuffer( array, byteStride / elementBytes );

					parser.cache.add( ibCacheKey, ib );

				}

				bufferAttribute = new InterleavedBufferAttribute( ib, itemSize, ( byteOffset % byteStride ) / elementBytes, normalized );

			} else {

				if ( bufferView === null ) {

					array = new TypedArray( accessorDef.count * itemSize );

				} else {

					array = new TypedArray( bufferView, byteOffset, accessorDef.count * itemSize );

				}

				bufferAttribute = new BufferAttribute( array, itemSize, normalized );

			}

			// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#sparse-accessors
			if ( accessorDef.sparse !== undefined ) {

				const itemSizeIndices = WEBGL_TYPE_SIZES.SCALAR;
				const TypedArrayIndices = WEBGL_COMPONENT_TYPES[ accessorDef.sparse.indices.componentType ];

				const byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
				const byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;

				const sparseIndices = new TypedArrayIndices( bufferViews[ 1 ], byteOffsetIndices, accessorDef.sparse.count * itemSizeIndices );
				const sparseValues = new TypedArray( bufferViews[ 2 ], byteOffsetValues, accessorDef.sparse.count * itemSize );

				if ( bufferView !== null ) {

					// Avoid modifying the original ArrayBuffer, if the bufferView wasn't initialized with zeroes.
					bufferAttribute = new BufferAttribute( bufferAttribute.array.slice(), bufferAttribute.itemSize, bufferAttribute.normalized );

				}

				// Ignore normalized since we copy from sparse
				bufferAttribute.normalized = false;

				for ( let i = 0, il = sparseIndices.length; i < il; i ++ ) {

					const index = sparseIndices[ i ];

					bufferAttribute.setX( index, sparseValues[ i * itemSize ] );
					if ( itemSize >= 2 ) bufferAttribute.setY( index, sparseValues[ i * itemSize + 1 ] );
					if ( itemSize >= 3 ) bufferAttribute.setZ( index, sparseValues[ i * itemSize + 2 ] );
					if ( itemSize >= 4 ) bufferAttribute.setW( index, sparseValues[ i * itemSize + 3 ] );
					if ( itemSize >= 5 ) throw new Error( 'THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.' );

				}

				bufferAttribute.normalized = normalized;

			}

			return bufferAttribute;

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#textures
	 *
	 * @private
	 * @param {number} textureIndex
	 * @return {Promise<?Texture>}
	 */
	loadTexture( textureIndex ) {

		const json = this.json;
		const options = this.options;
		const textureDef = json.textures[ textureIndex ];
		const sourceIndex = textureDef.source;
		const sourceDef = json.images[ sourceIndex ];

		let loader = this.textureLoader;

		if ( sourceDef.uri ) {

			const handler = options.manager.getHandler( sourceDef.uri );
			if ( handler !== null ) loader = handler;

		}

		return this.loadTextureImage( textureIndex, sourceIndex, loader );

	}

	loadTextureImage( textureIndex, sourceIndex, loader ) {

		const parser = this;
		const json = this.json;

		const textureDef = json.textures[ textureIndex ];
		const sourceDef = json.images[ sourceIndex ];

		const cacheKey = ( sourceDef.uri || sourceDef.bufferView ) + ':' + textureDef.sampler;

		if ( this.textureCache[ cacheKey ] ) {

			// See https://github.com/mrdoob/three.js/issues/21559.
			return this.textureCache[ cacheKey ];

		}

		const promise = this.loadImageSource( sourceIndex, loader ).then( function ( texture ) {

			texture.flipY = false;

			texture.name = textureDef.name || sourceDef.name || '';

			if ( texture.name === '' && typeof sourceDef.uri === 'string' && sourceDef.uri.startsWith( 'data:image/' ) === false ) {

				texture.name = sourceDef.uri;

			}

			const samplers = json.samplers || {};
			const sampler = samplers[ textureDef.sampler ] || {};

			texture.magFilter = WEBGL_FILTERS[ sampler.magFilter ] || LinearFilter;
			texture.minFilter = WEBGL_FILTERS[ sampler.minFilter ] || LinearMipmapLinearFilter;
			texture.wrapS = WEBGL_WRAPPINGS[ sampler.wrapS ] || RepeatWrapping;
			texture.wrapT = WEBGL_WRAPPINGS[ sampler.wrapT ] || RepeatWrapping;
			texture.generateMipmaps = ! texture.isCompressedTexture && texture.minFilter !== NearestFilter && texture.minFilter !== LinearFilter;

			parser.associations.set( texture, { textures: textureIndex } );

			return texture;

		} ).catch( function () {

			return null;

		} );

		this.textureCache[ cacheKey ] = promise;

		return promise;

	}

	loadImageSource( sourceIndex, loader ) {

		const parser = this;
		const json = this.json;
		const options = this.options;

		if ( this.sourceCache[ sourceIndex ] !== undefined ) {

			return this.sourceCache[ sourceIndex ].then( ( texture ) => texture.clone() );

		}

		const sourceDef = json.images[ sourceIndex ];

		const URL = self.URL || self.webkitURL;

		let sourceURI = sourceDef.uri || '';
		let isObjectURL = false;

		if ( sourceDef.bufferView !== undefined ) {

			// Load binary image data from bufferView, if provided.

			sourceURI = parser.getDependency( 'bufferView', sourceDef.bufferView ).then( function ( bufferView ) {

				isObjectURL = true;
				const blob = new Blob( [ bufferView ], { type: sourceDef.mimeType } );
				sourceURI = URL.createObjectURL( blob );
				return sourceURI;

			} );

		} else if ( sourceDef.uri === undefined ) {

			throw new Error( 'THREE.GLTFLoader: Image ' + sourceIndex + ' is missing URI and bufferView' );

		}

		const promise = Promise.resolve( sourceURI ).then( function ( sourceURI ) {

			return new Promise( function ( resolve, reject ) {

				let onLoad = resolve;

				if ( loader.isImageBitmapLoader === true ) {

					onLoad = function ( imageBitmap ) {

						const texture = new Texture( imageBitmap );
						texture.needsUpdate = true;

						resolve( texture );

					};

				}

				loader.load( LoaderUtils.resolveURL( sourceURI, options.path ), onLoad, undefined, reject );

			} );

		} ).then( function ( texture ) {

			// Clean up resources and configure Texture.

			if ( isObjectURL === true ) {

				URL.revokeObjectURL( sourceURI );

			}

			assignExtrasToUserData( texture, sourceDef );

			texture.userData.mimeType = sourceDef.mimeType || getImageURIMimeType( sourceDef.uri );

			return texture;

		} ).catch( function ( error ) {

			console.error( 'THREE.GLTFLoader: Couldn\'t load texture', sourceURI );
			throw error;

		} );

		this.sourceCache[ sourceIndex ] = promise;
		return promise;

	}

	/**
	 * Asynchronously assigns a texture to the given material parameters.
	 *
	 * @private
	 * @param {Object} materialParams
	 * @param {string} mapName
	 * @param {Object} mapDef
	 * @param {string} [colorSpace]
	 * @return {Promise<Texture>}
	 */
	assignTexture( materialParams, mapName, mapDef, colorSpace ) {

		const parser = this;

		return this.getDependency( 'texture', mapDef.index ).then( function ( texture ) {

			if ( ! texture ) return null;

			if ( mapDef.texCoord !== undefined && mapDef.texCoord > 0 ) {

				texture = texture.clone();
				texture.channel = mapDef.texCoord;

			}

			if ( parser.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ] ) {

				const transform = mapDef.extensions !== undefined ? mapDef.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ] : undefined;

				if ( transform ) {

					const gltfReference = parser.associations.get( texture );
					texture = parser.extensions[ EXTENSIONS.KHR_TEXTURE_TRANSFORM ].extendTexture( texture, transform );
					parser.associations.set( texture, gltfReference );

				}

			}

			if ( colorSpace !== undefined ) {

				texture.colorSpace = colorSpace;

			}

			materialParams[ mapName ] = texture;

			return texture;

		} );

	}

	/**
	 * Assigns final material to a Mesh, Line, or Points instance. The instance
	 * already has a material (generated from the glTF material options alone)
	 * but reuse of the same glTF material may require multiple threejs materials
	 * to accommodate different primitive types, defines, etc. New materials will
	 * be created if necessary, and reused from a cache.
	 *
	 * @private
	 * @param {Object3D} mesh Mesh, Line, or Points instance.
	 */
	assignFinalMaterial( mesh ) {

		const geometry = mesh.geometry;
		let material = mesh.material;

		const useDerivativeTangents = geometry.attributes.tangent === undefined;
		const useVertexColors = geometry.attributes.color !== undefined;
		const useFlatShading = geometry.attributes.normal === undefined;

		if ( mesh.isPoints ) {

			const cacheKey = 'PointsMaterial:' + material.uuid;

			let pointsMaterial = this.cache.get( cacheKey );

			if ( ! pointsMaterial ) {

				pointsMaterial = new PointsMaterial();
				Material.prototype.copy.call( pointsMaterial, material );
				pointsMaterial.color.copy( material.color );
				pointsMaterial.map = material.map;
				pointsMaterial.sizeAttenuation = false; // glTF spec says points should be 1px

				this.cache.add( cacheKey, pointsMaterial );

			}

			material = pointsMaterial;

		} else if ( mesh.isLine ) {

			const cacheKey = 'LineBasicMaterial:' + material.uuid;

			let lineMaterial = this.cache.get( cacheKey );

			if ( ! lineMaterial ) {

				lineMaterial = new LineBasicMaterial();
				Material.prototype.copy.call( lineMaterial, material );
				lineMaterial.color.copy( material.color );
				lineMaterial.map = material.map;

				this.cache.add( cacheKey, lineMaterial );

			}

			material = lineMaterial;

		}

		// Clone the material if it will be modified
		if ( useDerivativeTangents || useVertexColors || useFlatShading ) {

			let cacheKey = 'ClonedMaterial:' + material.uuid + ':';

			if ( useDerivativeTangents ) cacheKey += 'derivative-tangents:';
			if ( useVertexColors ) cacheKey += 'vertex-colors:';
			if ( useFlatShading ) cacheKey += 'flat-shading:';

			let cachedMaterial = this.cache.get( cacheKey );

			if ( ! cachedMaterial ) {

				cachedMaterial = material.clone();

				if ( useVertexColors ) cachedMaterial.vertexColors = true;
				if ( useFlatShading ) cachedMaterial.flatShading = true;

				if ( useDerivativeTangents ) {

					// https://github.com/mrdoob/three.js/issues/11438#issuecomment-507003995
					if ( cachedMaterial.normalScale ) cachedMaterial.normalScale.y *= -1;
					if ( cachedMaterial.clearcoatNormalScale ) cachedMaterial.clearcoatNormalScale.y *= -1;

				}

				this.cache.add( cacheKey, cachedMaterial );

				this.associations.set( cachedMaterial, this.associations.get( material ) );

			}

			material = cachedMaterial;

		}

		mesh.material = material;

	}

	getMaterialType( /* materialIndex */ ) {

		return MeshStandardMaterial;

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#materials
	 *
	 * @private
	 * @param {number} materialIndex
	 * @return {Promise<Material>}
	 */
	loadMaterial( materialIndex ) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;
		const materialDef = json.materials[ materialIndex ];

		let materialType;
		const materialParams = {};
		const materialExtensions = materialDef.extensions || {};

		const pending = [];

		if ( materialExtensions[ EXTENSIONS.KHR_MATERIALS_UNLIT ] ) {

			const kmuExtension = extensions[ EXTENSIONS.KHR_MATERIALS_UNLIT ];
			materialType = kmuExtension.getMaterialType();
			pending.push( kmuExtension.extendParams( materialParams, materialDef, parser ) );

		} else {

			// Specification:
			// https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#metallic-roughness-material

			const metallicRoughness = materialDef.pbrMetallicRoughness || {};

			materialParams.color = new Color( 1.0, 1.0, 1.0 );
			materialParams.opacity = 1.0;

			if ( Array.isArray( metallicRoughness.baseColorFactor ) ) {

				const array = metallicRoughness.baseColorFactor;

				materialParams.color.setRGB( array[ 0 ], array[ 1 ], array[ 2 ], LinearSRGBColorSpace );
				materialParams.opacity = array[ 3 ];

			}

			if ( metallicRoughness.baseColorTexture !== undefined ) {

				pending.push( parser.assignTexture( materialParams, 'map', metallicRoughness.baseColorTexture, SRGBColorSpace ) );

			}

			materialParams.metalness = metallicRoughness.metallicFactor !== undefined ? metallicRoughness.metallicFactor : 1.0;
			materialParams.roughness = metallicRoughness.roughnessFactor !== undefined ? metallicRoughness.roughnessFactor : 1.0;

			if ( metallicRoughness.metallicRoughnessTexture !== undefined ) {

				pending.push( parser.assignTexture( materialParams, 'metalnessMap', metallicRoughness.metallicRoughnessTexture ) );
				pending.push( parser.assignTexture( materialParams, 'roughnessMap', metallicRoughness.metallicRoughnessTexture ) );

			}

			materialType = this._invokeOne( function ( ext ) {

				return ext.getMaterialType && ext.getMaterialType( materialIndex );

			} );

			pending.push( Promise.all( this._invokeAll( function ( ext ) {

				return ext.extendMaterialParams && ext.extendMaterialParams( materialIndex, materialParams );

			} ) ) );

		}

		if ( materialDef.doubleSided === true ) {

			materialParams.side = DoubleSide;

		}

		const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;

		if ( alphaMode === ALPHA_MODES.BLEND ) {

			materialParams.transparent = true;

			// See: https://github.com/mrdoob/three.js/issues/17706
			materialParams.depthWrite = false;

		} else {

			materialParams.transparent = false;

			if ( alphaMode === ALPHA_MODES.MASK ) {

				materialParams.alphaTest = materialDef.alphaCutoff !== undefined ? materialDef.alphaCutoff : 0.5;

			}

		}

		if ( materialDef.normalTexture !== undefined && materialType !== MeshBasicMaterial ) {

			pending.push( parser.assignTexture( materialParams, 'normalMap', materialDef.normalTexture ) );

			materialParams.normalScale = new Vector2( 1, 1 );

			if ( materialDef.normalTexture.scale !== undefined ) {

				const scale = materialDef.normalTexture.scale;

				materialParams.normalScale.set( scale, scale );

			}

		}

		if ( materialDef.occlusionTexture !== undefined && materialType !== MeshBasicMaterial ) {

			pending.push( parser.assignTexture( materialParams, 'aoMap', materialDef.occlusionTexture ) );

			if ( materialDef.occlusionTexture.strength !== undefined ) {

				materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;

			}

		}

		if ( materialDef.emissiveFactor !== undefined && materialType !== MeshBasicMaterial ) {

			const emissiveFactor = materialDef.emissiveFactor;
			materialParams.emissive = new Color().setRGB( emissiveFactor[ 0 ], emissiveFactor[ 1 ], emissiveFactor[ 2 ], LinearSRGBColorSpace );

		}

		if ( materialDef.emissiveTexture !== undefined && materialType !== MeshBasicMaterial ) {

			pending.push( parser.assignTexture( materialParams, 'emissiveMap', materialDef.emissiveTexture, SRGBColorSpace ) );

		}

		return Promise.all( pending ).then( function () {

			const material = new materialType( materialParams );

			if ( materialDef.name ) material.name = materialDef.name;

			assignExtrasToUserData( material, materialDef );

			parser.associations.set( material, { materials: materialIndex } );

			if ( materialDef.extensions ) addUnknownExtensionsToUserData( extensions, material, materialDef );

			return material;

		} );

	}

	/**
	 * When Object3D instances are targeted by animation, they need unique names.
	 *
	 * @private
	 * @param {string} originalName
	 * @return {string}
	 */
	createUniqueName( originalName ) {

		const sanitizedName = PropertyBinding.sanitizeNodeName( originalName || '' );

		if ( sanitizedName in this.nodeNamesUsed ) {

			return sanitizedName + '_' + ( ++ this.nodeNamesUsed[ sanitizedName ] );

		} else {

			this.nodeNamesUsed[ sanitizedName ] = 0;

			return sanitizedName;

		}

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#geometry
	 *
	 * Creates BufferGeometries from primitives.
	 *
	 * @private
	 * @param {Array<GLTF.Primitive>} primitives
	 * @return {Promise<Array<BufferGeometry>>}
	 */
	loadGeometries( primitives ) {

		const parser = this;
		const extensions = this.extensions;
		const cache = this.primitiveCache;

		function createDracoPrimitive( primitive ) {

			return extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ]
				.decodePrimitive( primitive, parser )
				.then( function ( geometry ) {

					return addPrimitiveAttributes( geometry, primitive, parser );

				} );

		}

		const pending = [];

		for ( let i = 0, il = primitives.length; i < il; i ++ ) {

			const primitive = primitives[ i ];
			const cacheKey = createPrimitiveKey( primitive );

			// See if we've already created this geometry
			const cached = cache[ cacheKey ];

			if ( cached ) {

				// Use the cached geometry if it exists
				pending.push( cached.promise );

			} else {

				let geometryPromise;

				if ( primitive.extensions && primitive.extensions[ EXTENSIONS.KHR_DRACO_MESH_COMPRESSION ] ) {

					// Use DRACO geometry if available
					geometryPromise = createDracoPrimitive( primitive );

				} else {

					// Otherwise create a new geometry
					geometryPromise = addPrimitiveAttributes( new BufferGeometry(), primitive, parser );

				}

				// Cache this geometry
				cache[ cacheKey ] = { primitive: primitive, promise: geometryPromise };

				pending.push( geometryPromise );

			}

		}

		return Promise.all( pending );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes
	 *
	 * @private
	 * @param {number} meshIndex
	 * @return {Promise<Group|Mesh|SkinnedMesh|Line|Points>}
	 */
	loadMesh( meshIndex ) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;

		const meshDef = json.meshes[ meshIndex ];
		const primitives = meshDef.primitives;

		const pending = [];

		for ( let i = 0, il = primitives.length; i < il; i ++ ) {

			const material = primitives[ i ].material === undefined
				? createDefaultMaterial( this.cache )
				: this.getDependency( 'material', primitives[ i ].material );

			pending.push( material );

		}

		pending.push( parser.loadGeometries( primitives ) );

		return Promise.all( pending ).then( function ( results ) {

			const materials = results.slice( 0, results.length - 1 );
			const geometries = results[ results.length - 1 ];

			const meshes = [];

			for ( let i = 0, il = geometries.length; i < il; i ++ ) {

				const geometry = geometries[ i ];
				const primitive = primitives[ i ];

				// 1. create Mesh

				let mesh;

				const material = materials[ i ];

				if ( primitive.mode === WEBGL_CONSTANTS$1.TRIANGLES ||
						primitive.mode === WEBGL_CONSTANTS$1.TRIANGLE_STRIP ||
						primitive.mode === WEBGL_CONSTANTS$1.TRIANGLE_FAN ||
						primitive.mode === undefined ) {

					// .isSkinnedMesh isn't in glTF spec. See ._markDefs()
					mesh = meshDef.isSkinnedMesh === true
						? new SkinnedMesh( geometry, material )
						: new Mesh( geometry, material );

					if ( mesh.isSkinnedMesh === true ) {

						// normalize skin weights to fix malformed assets (see #15319)
						mesh.normalizeSkinWeights();

					}

					if ( primitive.mode === WEBGL_CONSTANTS$1.TRIANGLE_STRIP ) {

						mesh.geometry = toTrianglesDrawMode( mesh.geometry, TriangleStripDrawMode );

					} else if ( primitive.mode === WEBGL_CONSTANTS$1.TRIANGLE_FAN ) {

						mesh.geometry = toTrianglesDrawMode( mesh.geometry, TriangleFanDrawMode );

					}

				} else if ( primitive.mode === WEBGL_CONSTANTS$1.LINES ) {

					mesh = new LineSegments( geometry, material );

				} else if ( primitive.mode === WEBGL_CONSTANTS$1.LINE_STRIP ) {

					mesh = new Line( geometry, material );

				} else if ( primitive.mode === WEBGL_CONSTANTS$1.LINE_LOOP ) {

					mesh = new LineLoop( geometry, material );

				} else if ( primitive.mode === WEBGL_CONSTANTS$1.POINTS ) {

					mesh = new Points( geometry, material );

				} else {

					throw new Error( 'THREE.GLTFLoader: Primitive mode unsupported: ' + primitive.mode );

				}

				if ( Object.keys( mesh.geometry.morphAttributes ).length > 0 ) {

					updateMorphTargets( mesh, meshDef );

				}

				mesh.name = parser.createUniqueName( meshDef.name || ( 'mesh_' + meshIndex ) );

				assignExtrasToUserData( mesh, meshDef );

				if ( primitive.extensions ) addUnknownExtensionsToUserData( extensions, mesh, primitive );

				parser.assignFinalMaterial( mesh );

				meshes.push( mesh );

			}

			for ( let i = 0, il = meshes.length; i < il; i ++ ) {

				parser.associations.set( meshes[ i ], {
					meshes: meshIndex,
					primitives: i
				} );

			}

			if ( meshes.length === 1 ) {

				if ( meshDef.extensions ) addUnknownExtensionsToUserData( extensions, meshes[ 0 ], meshDef );

				return meshes[ 0 ];

			}

			const group = new Group();

			if ( meshDef.extensions ) addUnknownExtensionsToUserData( extensions, group, meshDef );

			parser.associations.set( group, { meshes: meshIndex } );

			for ( let i = 0, il = meshes.length; i < il; i ++ ) {

				group.add( meshes[ i ] );

			}

			return group;

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
	 *
	 * @private
	 * @param {number} cameraIndex
	 * @return {Promise<Camera>|undefined}
	 */
	loadCamera( cameraIndex ) {

		let camera;
		const cameraDef = this.json.cameras[ cameraIndex ];
		const params = cameraDef[ cameraDef.type ];

		if ( ! params ) {

			console.warn( 'THREE.GLTFLoader: Missing camera parameters.' );
			return;

		}

		if ( cameraDef.type === 'perspective' ) {

			camera = new PerspectiveCamera( MathUtils.radToDeg( params.yfov ), params.aspectRatio || 1, params.znear || 1, params.zfar || 2e6 );

		} else if ( cameraDef.type === 'orthographic' ) {

			camera = new OrthographicCamera( - params.xmag, params.xmag, params.ymag, - params.ymag, params.znear, params.zfar );

		}

		if ( cameraDef.name ) camera.name = this.createUniqueName( cameraDef.name );

		assignExtrasToUserData( camera, cameraDef );

		return Promise.resolve( camera );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#skins
	 *
	 * @private
	 * @param {number} skinIndex
	 * @return {Promise<Skeleton>}
	 */
	loadSkin( skinIndex ) {

		const skinDef = this.json.skins[ skinIndex ];

		const pending = [];

		for ( let i = 0, il = skinDef.joints.length; i < il; i ++ ) {

			pending.push( this._loadNodeShallow( skinDef.joints[ i ] ) );

		}

		if ( skinDef.inverseBindMatrices !== undefined ) {

			pending.push( this.getDependency( 'accessor', skinDef.inverseBindMatrices ) );

		} else {

			pending.push( null );

		}

		return Promise.all( pending ).then( function ( results ) {

			const inverseBindMatrices = results.pop();
			const jointNodes = results;

			// Note that bones (joint nodes) may or may not be in the
			// scene graph at this time.

			const bones = [];
			const boneInverses = [];

			for ( let i = 0, il = jointNodes.length; i < il; i ++ ) {

				const jointNode = jointNodes[ i ];

				if ( jointNode ) {

					bones.push( jointNode );

					const mat = new Matrix4();

					if ( inverseBindMatrices !== null ) {

						mat.fromArray( inverseBindMatrices.array, i * 16 );

					}

					boneInverses.push( mat );

				} else {

					console.warn( 'THREE.GLTFLoader: Joint "%s" could not be found.', skinDef.joints[ i ] );

				}

			}

			return new Skeleton( bones, boneInverses );

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
	 *
	 * @private
	 * @param {number} animationIndex
	 * @return {Promise<AnimationClip>}
	 */
	loadAnimation( animationIndex ) {

		const json = this.json;
		const parser = this;

		const animationDef = json.animations[ animationIndex ];
		const animationName = animationDef.name ? animationDef.name : 'animation_' + animationIndex;

		const pendingNodes = [];
		const pendingInputAccessors = [];
		const pendingOutputAccessors = [];
		const pendingSamplers = [];
		const pendingTargets = [];

		for ( let i = 0, il = animationDef.channels.length; i < il; i ++ ) {

			const channel = animationDef.channels[ i ];
			const sampler = animationDef.samplers[ channel.sampler ];
			const target = channel.target;
			const name = target.node;
			const input = animationDef.parameters !== undefined ? animationDef.parameters[ sampler.input ] : sampler.input;
			const output = animationDef.parameters !== undefined ? animationDef.parameters[ sampler.output ] : sampler.output;

			if ( target.node === undefined ) continue;

			pendingNodes.push( this.getDependency( 'node', name ) );
			pendingInputAccessors.push( this.getDependency( 'accessor', input ) );
			pendingOutputAccessors.push( this.getDependency( 'accessor', output ) );
			pendingSamplers.push( sampler );
			pendingTargets.push( target );

		}

		return Promise.all( [

			Promise.all( pendingNodes ),
			Promise.all( pendingInputAccessors ),
			Promise.all( pendingOutputAccessors ),
			Promise.all( pendingSamplers ),
			Promise.all( pendingTargets )

		] ).then( function ( dependencies ) {

			const nodes = dependencies[ 0 ];
			const inputAccessors = dependencies[ 1 ];
			const outputAccessors = dependencies[ 2 ];
			const samplers = dependencies[ 3 ];
			const targets = dependencies[ 4 ];

			const tracks = [];

			for ( let i = 0, il = nodes.length; i < il; i ++ ) {

				const node = nodes[ i ];
				const inputAccessor = inputAccessors[ i ];
				const outputAccessor = outputAccessors[ i ];
				const sampler = samplers[ i ];
				const target = targets[ i ];

				if ( node === undefined ) continue;

				if ( node.updateMatrix ) {

					node.updateMatrix();

				}

				const createdTracks = parser._createAnimationTracks( node, inputAccessor, outputAccessor, sampler, target );

				if ( createdTracks ) {

					for ( let k = 0; k < createdTracks.length; k ++ ) {

						tracks.push( createdTracks[ k ] );

					}

				}

			}

			const animation = new AnimationClip( animationName, undefined, tracks );

			assignExtrasToUserData( animation, animationDef );

			return animation;

		} );

	}

	createNodeMesh( nodeIndex ) {

		const json = this.json;
		const parser = this;
		const nodeDef = json.nodes[ nodeIndex ];

		if ( nodeDef.mesh === undefined ) return null;

		return parser.getDependency( 'mesh', nodeDef.mesh ).then( function ( mesh ) {

			const node = parser._getNodeRef( parser.meshCache, nodeDef.mesh, mesh );

			// if weights are provided on the node, override weights on the mesh.
			if ( nodeDef.weights !== undefined ) {

				node.traverse( function ( o ) {

					if ( ! o.isMesh ) return;

					for ( let i = 0, il = nodeDef.weights.length; i < il; i ++ ) {

						o.morphTargetInfluences[ i ] = nodeDef.weights[ i ];

					}

				} );

			}

			return node;

		} );

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
	 *
	 * @private
	 * @param {number} nodeIndex
	 * @return {Promise<Object3D>}
	 */
	loadNode( nodeIndex ) {

		const json = this.json;
		const parser = this;

		const nodeDef = json.nodes[ nodeIndex ];

		const nodePending = parser._loadNodeShallow( nodeIndex );

		const childPending = [];
		const childrenDef = nodeDef.children || [];

		for ( let i = 0, il = childrenDef.length; i < il; i ++ ) {

			childPending.push( parser.getDependency( 'node', childrenDef[ i ] ) );

		}

		const skeletonPending = nodeDef.skin === undefined
			? Promise.resolve( null )
			: parser.getDependency( 'skin', nodeDef.skin );

		return Promise.all( [
			nodePending,
			Promise.all( childPending ),
			skeletonPending
		] ).then( function ( results ) {

			const node = results[ 0 ];
			const children = results[ 1 ];
			const skeleton = results[ 2 ];

			if ( skeleton !== null ) {

				// This full traverse should be fine because
				// child glTF nodes have not been added to this node yet.
				node.traverse( function ( mesh ) {

					if ( ! mesh.isSkinnedMesh ) return;

					mesh.bind( skeleton, _identityMatrix );

				} );

			}

			for ( let i = 0, il = children.length; i < il; i ++ ) {

				node.add( children[ i ] );

			}

			return node;

		} );

	}

	// ._loadNodeShallow() parses a single node.
	// skin and child nodes are created and added in .loadNode() (no '_' prefix).
	_loadNodeShallow( nodeIndex ) {

		const json = this.json;
		const extensions = this.extensions;
		const parser = this;

		// This method is called from .loadNode() and .loadSkin().
		// Cache a node to avoid duplication.

		if ( this.nodeCache[ nodeIndex ] !== undefined ) {

			return this.nodeCache[ nodeIndex ];

		}

		const nodeDef = json.nodes[ nodeIndex ];

		// reserve node's name before its dependencies, so the root has the intended name.
		const nodeName = nodeDef.name ? parser.createUniqueName( nodeDef.name ) : '';

		const pending = [];

		const meshPromise = parser._invokeOne( function ( ext ) {

			return ext.createNodeMesh && ext.createNodeMesh( nodeIndex );

		} );

		if ( meshPromise ) {

			pending.push( meshPromise );

		}

		if ( nodeDef.camera !== undefined ) {

			pending.push( parser.getDependency( 'camera', nodeDef.camera ).then( function ( camera ) {

				return parser._getNodeRef( parser.cameraCache, nodeDef.camera, camera );

			} ) );

		}

		parser._invokeAll( function ( ext ) {

			return ext.createNodeAttachment && ext.createNodeAttachment( nodeIndex );

		} ).forEach( function ( promise ) {

			pending.push( promise );

		} );

		this.nodeCache[ nodeIndex ] = Promise.all( pending ).then( function ( objects ) {

			let node;

			// .isBone isn't in glTF spec. See ._markDefs
			if ( nodeDef.isBone === true ) {

				node = new Bone();

			} else if ( objects.length > 1 ) {

				node = new Group();

			} else if ( objects.length === 1 ) {

				node = objects[ 0 ];

			} else {

				node = new Object3D();

			}

			if ( node !== objects[ 0 ] ) {

				for ( let i = 0, il = objects.length; i < il; i ++ ) {

					node.add( objects[ i ] );

				}

			}

			if ( nodeDef.name ) {

				node.userData.name = nodeDef.name;
				node.name = nodeName;

			}

			assignExtrasToUserData( node, nodeDef );

			if ( nodeDef.extensions ) addUnknownExtensionsToUserData( extensions, node, nodeDef );

			if ( nodeDef.matrix !== undefined ) {

				const matrix = new Matrix4();
				matrix.fromArray( nodeDef.matrix );
				node.applyMatrix4( matrix );

			} else {

				if ( nodeDef.translation !== undefined ) {

					node.position.fromArray( nodeDef.translation );

				}

				if ( nodeDef.rotation !== undefined ) {

					node.quaternion.fromArray( nodeDef.rotation );

				}

				if ( nodeDef.scale !== undefined ) {

					node.scale.fromArray( nodeDef.scale );

				}

			}

			if ( ! parser.associations.has( node ) ) {

				parser.associations.set( node, {} );

			} else if ( nodeDef.mesh !== undefined && parser.meshCache.refs[ nodeDef.mesh ] > 1 ) {

				const mapping = parser.associations.get( node );
				parser.associations.set( node, { ...mapping } );

			}

			parser.associations.get( node ).nodes = nodeIndex;

			return node;

		} );

		return this.nodeCache[ nodeIndex ];

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
	 *
	 * @private
	 * @param {number} sceneIndex
	 * @return {Promise<Group>}
	 */
	loadScene( sceneIndex ) {

		const extensions = this.extensions;
		const sceneDef = this.json.scenes[ sceneIndex ];
		const parser = this;

		// Loader returns Group, not Scene.
		// See: https://github.com/mrdoob/three.js/issues/18342#issuecomment-578981172
		const scene = new Group();
		if ( sceneDef.name ) scene.name = parser.createUniqueName( sceneDef.name );

		assignExtrasToUserData( scene, sceneDef );

		if ( sceneDef.extensions ) addUnknownExtensionsToUserData( extensions, scene, sceneDef );

		const nodeIds = sceneDef.nodes || [];

		const pending = [];

		for ( let i = 0, il = nodeIds.length; i < il; i ++ ) {

			pending.push( parser.getDependency( 'node', nodeIds[ i ] ) );

		}

		return Promise.all( pending ).then( function ( nodes ) {

			for ( let i = 0, il = nodes.length; i < il; i ++ ) {

				scene.add( nodes[ i ] );

			}

			// Removes dangling associations, associations that reference a node that
			// didn't make it into the scene.
			const reduceAssociations = ( node ) => {

				const reducedAssociations = new Map();

				for ( const [ key, value ] of parser.associations ) {

					if ( key instanceof Material || key instanceof Texture ) {

						reducedAssociations.set( key, value );

					}

				}

				node.traverse( ( node ) => {

					const mappings = parser.associations.get( node );

					if ( mappings != null ) {

						reducedAssociations.set( node, mappings );

					}

				} );

				return reducedAssociations;

			};

			parser.associations = reduceAssociations( scene );

			return scene;

		} );

	}

	_createAnimationTracks( node, inputAccessor, outputAccessor, sampler, target ) {

		const tracks = [];

		const targetName = node.name ? node.name : node.uuid;
		const targetNames = [];

		if ( PATH_PROPERTIES$1[ target.path ] === PATH_PROPERTIES$1.weights ) {

			node.traverse( function ( object ) {

				if ( object.morphTargetInfluences ) {

					targetNames.push( object.name ? object.name : object.uuid );

				}

			} );

		} else {

			targetNames.push( targetName );

		}

		let TypedKeyframeTrack;

		switch ( PATH_PROPERTIES$1[ target.path ] ) {

			case PATH_PROPERTIES$1.weights:

				TypedKeyframeTrack = NumberKeyframeTrack;
				break;

			case PATH_PROPERTIES$1.rotation:

				TypedKeyframeTrack = QuaternionKeyframeTrack;
				break;

			case PATH_PROPERTIES$1.translation:
			case PATH_PROPERTIES$1.scale:

				TypedKeyframeTrack = VectorKeyframeTrack;
				break;

			default:

				switch ( outputAccessor.itemSize ) {

					case 1:
						TypedKeyframeTrack = NumberKeyframeTrack;
						break;
					case 2:
					case 3:
					default:
						TypedKeyframeTrack = VectorKeyframeTrack;
						break;

				}

				break;

		}

		const interpolation = sampler.interpolation !== undefined ? INTERPOLATION[ sampler.interpolation ] : InterpolateLinear;


		const outputArray = this._getArrayFromAccessor( outputAccessor );

		for ( let j = 0, jl = targetNames.length; j < jl; j ++ ) {

			const track = new TypedKeyframeTrack(
				targetNames[ j ] + '.' + PATH_PROPERTIES$1[ target.path ],
				inputAccessor.array,
				outputArray,
				interpolation
			);

			// Override interpolation with custom factory method.
			if ( sampler.interpolation === 'CUBICSPLINE' ) {

				this._createCubicSplineTrackInterpolant( track );

			}

			tracks.push( track );

		}

		return tracks;

	}

	_getArrayFromAccessor( accessor ) {

		let outputArray = accessor.array;

		if ( accessor.normalized ) {

			const scale = getNormalizedComponentScale( outputArray.constructor );
			const scaled = new Float32Array( outputArray.length );

			for ( let j = 0, jl = outputArray.length; j < jl; j ++ ) {

				scaled[ j ] = outputArray[ j ] * scale;

			}

			outputArray = scaled;

		}

		return outputArray;

	}

	_createCubicSplineTrackInterpolant( track ) {

		track.createInterpolant = function InterpolantFactoryMethodGLTFCubicSpline( result ) {

			// A CUBICSPLINE keyframe in glTF has three output values for each input value,
			// representing inTangent, splineVertex, and outTangent. As a result, track.getValueSize()
			// must be divided by three to get the interpolant's sampleSize argument.

			const interpolantType = ( this instanceof QuaternionKeyframeTrack ) ? GLTFCubicSplineQuaternionInterpolant : GLTFCubicSplineInterpolant;

			return new interpolantType( this.times, this.values, this.getValueSize() / 3, result );

		};

		// Mark as CUBICSPLINE. `track.getInterpolation()` doesn't support custom interpolants.
		track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = true;

	}

}

/**
 *
 * @private
 * @param {BufferGeometry} geometry
 * @param {GLTF.Primitive} primitiveDef
 * @param {GLTFParser} parser
 */
function computeBounds( geometry, primitiveDef, parser ) {

	const attributes = primitiveDef.attributes;

	const box = new Box3();

	if ( attributes.POSITION !== undefined ) {

		const accessor = parser.json.accessors[ attributes.POSITION ];

		const min = accessor.min;
		const max = accessor.max;

		// glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

		if ( min !== undefined && max !== undefined ) {

			box.set(
				new Vector3( min[ 0 ], min[ 1 ], min[ 2 ] ),
				new Vector3( max[ 0 ], max[ 1 ], max[ 2 ] )
			);

			if ( accessor.normalized ) {

				const boxScale = getNormalizedComponentScale( WEBGL_COMPONENT_TYPES[ accessor.componentType ] );
				box.min.multiplyScalar( boxScale );
				box.max.multiplyScalar( boxScale );

			}

		} else {

			console.warn( 'THREE.GLTFLoader: Missing min/max properties for accessor POSITION.' );

			return;

		}

	} else {

		return;

	}

	const targets = primitiveDef.targets;

	if ( targets !== undefined ) {

		const maxDisplacement = new Vector3();
		const vector = new Vector3();

		for ( let i = 0, il = targets.length; i < il; i ++ ) {

			const target = targets[ i ];

			if ( target.POSITION !== undefined ) {

				const accessor = parser.json.accessors[ target.POSITION ];
				const min = accessor.min;
				const max = accessor.max;

				// glTF requires 'min' and 'max', but VRM (which extends glTF) currently ignores that requirement.

				if ( min !== undefined && max !== undefined ) {

					// we need to get max of absolute components because target weight is [-1,1]
					vector.setX( Math.max( Math.abs( min[ 0 ] ), Math.abs( max[ 0 ] ) ) );
					vector.setY( Math.max( Math.abs( min[ 1 ] ), Math.abs( max[ 1 ] ) ) );
					vector.setZ( Math.max( Math.abs( min[ 2 ] ), Math.abs( max[ 2 ] ) ) );


					if ( accessor.normalized ) {

						const boxScale = getNormalizedComponentScale( WEBGL_COMPONENT_TYPES[ accessor.componentType ] );
						vector.multiplyScalar( boxScale );

					}

					// Note: this assumes that the sum of all weights is at most 1. This isn't quite correct - it's more conservative
					// to assume that each target can have a max weight of 1. However, for some use cases - notably, when morph targets
					// are used to implement key-frame animations and as such only two are active at a time - this results in very large
					// boxes. So for now we make a box that's sometimes a touch too small but is hopefully mostly of reasonable size.
					maxDisplacement.max( vector );

				} else {

					console.warn( 'THREE.GLTFLoader: Missing min/max properties for accessor POSITION.' );

				}

			}

		}

		// As per comment above this box isn't conservative, but has a reasonable size for a very large number of morph targets.
		box.expandByVector( maxDisplacement );

	}

	geometry.boundingBox = box;

	const sphere = new Sphere();

	box.getCenter( sphere.center );
	sphere.radius = box.min.distanceTo( box.max ) / 2;

	geometry.boundingSphere = sphere;

}

/**
 *
 * @private
 * @param {BufferGeometry} geometry
 * @param {GLTF.Primitive} primitiveDef
 * @param {GLTFParser} parser
 * @return {Promise<BufferGeometry>}
 */
function addPrimitiveAttributes( geometry, primitiveDef, parser ) {

	const attributes = primitiveDef.attributes;

	const pending = [];

	function assignAttributeAccessor( accessorIndex, attributeName ) {

		return parser.getDependency( 'accessor', accessorIndex )
			.then( function ( accessor ) {

				geometry.setAttribute( attributeName, accessor );

			} );

	}

	for ( const gltfAttributeName in attributes ) {

		const threeAttributeName = ATTRIBUTES[ gltfAttributeName ] || gltfAttributeName.toLowerCase();

		// Skip attributes already provided by e.g. Draco extension.
		if ( threeAttributeName in geometry.attributes ) continue;

		pending.push( assignAttributeAccessor( attributes[ gltfAttributeName ], threeAttributeName ) );

	}

	if ( primitiveDef.indices !== undefined && ! geometry.index ) {

		const accessor = parser.getDependency( 'accessor', primitiveDef.indices ).then( function ( accessor ) {

			geometry.setIndex( accessor );

		} );

		pending.push( accessor );

	}

	if ( ColorManagement.workingColorSpace !== LinearSRGBColorSpace && 'COLOR_0' in attributes ) {

		console.warn( `THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${ColorManagement.workingColorSpace}" not supported.` );

	}

	assignExtrasToUserData( geometry, primitiveDef );

	computeBounds( geometry, primitiveDef, parser );

	return Promise.all( pending ).then( function () {

		return primitiveDef.targets !== undefined
			? addMorphTargets( geometry, primitiveDef.targets, parser )
			: geometry;

	} );

}

/*!
fflate - fast JavaScript compression/decompression
<https://101arrowz.github.io/fflate>
Licensed under MIT. https://github.com/101arrowz/fflate/blob/master/LICENSE
version 0.8.2
*/
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
  var x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
  flt[i] = 8;
for (var i = 144; i < 256; ++i)
  flt[i] = 9;
for (var i = 256; i < 280; ++i)
  flt[i] = 7;
for (var i = 280; i < 288; ++i)
  flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
  fdt[i] = 5;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == 1)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data), -4), { i: 2 }, opts, opts);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
  var _a2 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = o == 4294967295 || c == 65535;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  for (var i = 0; i < c; ++i) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

/**
 * @module NURBSUtils
 * @three_import import * as NURBSUtils from 'three/addons/curves/NURBSUtils.js';
 */

/**
 * Finds knot vector span.
 *
 * @param {number} p - The degree.
 * @param {number} u - The parametric value.
 * @param {Array<number>} U - The knot vector.
 * @return {number} The span.
 */
function findSpan( p, u, U ) {

	const n = U.length - p - 1;

	if ( u >= U[ n ] ) {

		return n - 1;

	}

	if ( u <= U[ p ] ) {

		return p;

	}

	let low = p;
	let high = n;
	let mid = Math.floor( ( low + high ) / 2 );

	while ( u < U[ mid ] || u >= U[ mid + 1 ] ) {

		if ( u < U[ mid ] ) {

			high = mid;

		} else {

			low = mid;

		}

		mid = Math.floor( ( low + high ) / 2 );

	}

	return mid;

}

/**
 * Calculates basis functions. See The NURBS Book, page 70, algorithm A2.2.
 *
 * @param {number} span - The span in which `u` lies.
 * @param {number} u - The parametric value.
 * @param {number} p - The degree.
 * @param {Array<number>} U - The knot vector.
 * @return {Array<number>} Array[p+1] with basis functions values.
 */
function calcBasisFunctions( span, u, p, U ) {

	const N = [];
	const left = [];
	const right = [];
	N[ 0 ] = 1.0;

	for ( let j = 1; j <= p; ++ j ) {

		left[ j ] = u - U[ span + 1 - j ];
		right[ j ] = U[ span + j ] - u;

		let saved = 0.0;

		for ( let r = 0; r < j; ++ r ) {

			const rv = right[ r + 1 ];
			const lv = left[ j - r ];
			const temp = N[ r ] / ( rv + lv );
			N[ r ] = saved + rv * temp;
			saved = lv * temp;

		}

		N[ j ] = saved;

	}

	return N;

}

/**
 * Calculates B-Spline curve points. See The NURBS Book, page 82, algorithm A3.1.
 *
 * @param {number} p - The degree of the B-Spline.
 * @param {Array<number>} U - The knot vector.
 * @param {Array<Vector4>} P - The control points
 * @param {number} u - The parametric point.
 * @return {Vector4} The point for given `u`.
 */
function calcBSplinePoint( p, U, P, u ) {

	const span = findSpan( p, u, U );
	const N = calcBasisFunctions( span, u, p, U );
	const C = new Vector4( 0, 0, 0, 0 );

	for ( let j = 0; j <= p; ++ j ) {

		const point = P[ span - p + j ];
		const Nj = N[ j ];
		const wNj = point.w * Nj;
		C.x += point.x * wNj;
		C.y += point.y * wNj;
		C.z += point.z * wNj;
		C.w += point.w * Nj;

	}

	return C;

}

/**
 * Calculates basis functions derivatives. See The NURBS Book, page 72, algorithm A2.3.
 *
 * @param {number} span - The span in which `u` lies.
 * @param {number} u - The parametric point.
 * @param {number} p - The degree.
 * @param {number} n - number of derivatives to calculate
 * @param {Array<number>} U - The knot vector.
 * @return {Array<Array<number>>} An array[n+1][p+1] with basis functions derivatives.
 */
function calcBasisFunctionDerivatives( span, u, p, n, U ) {

	const zeroArr = [];
	for ( let i = 0; i <= p; ++ i )
		zeroArr[ i ] = 0.0;

	const ders = [];

	for ( let i = 0; i <= n; ++ i )
		ders[ i ] = zeroArr.slice( 0 );

	const ndu = [];

	for ( let i = 0; i <= p; ++ i )
		ndu[ i ] = zeroArr.slice( 0 );

	ndu[ 0 ][ 0 ] = 1.0;

	const left = zeroArr.slice( 0 );
	const right = zeroArr.slice( 0 );

	for ( let j = 1; j <= p; ++ j ) {

		left[ j ] = u - U[ span + 1 - j ];
		right[ j ] = U[ span + j ] - u;

		let saved = 0.0;

		for ( let r = 0; r < j; ++ r ) {

			const rv = right[ r + 1 ];
			const lv = left[ j - r ];
			ndu[ j ][ r ] = rv + lv;

			const temp = ndu[ r ][ j - 1 ] / ndu[ j ][ r ];
			ndu[ r ][ j ] = saved + rv * temp;
			saved = lv * temp;

		}

		ndu[ j ][ j ] = saved;

	}

	for ( let j = 0; j <= p; ++ j ) {

		ders[ 0 ][ j ] = ndu[ j ][ p ];

	}

	for ( let r = 0; r <= p; ++ r ) {

		let s1 = 0;
		let s2 = 1;

		const a = [];
		for ( let i = 0; i <= p; ++ i ) {

			a[ i ] = zeroArr.slice( 0 );

		}

		a[ 0 ][ 0 ] = 1.0;

		for ( let k = 1; k <= n; ++ k ) {

			let d = 0.0;
			const rk = r - k;
			const pk = p - k;

			if ( r >= k ) {

				a[ s2 ][ 0 ] = a[ s1 ][ 0 ] / ndu[ pk + 1 ][ rk ];
				d = a[ s2 ][ 0 ] * ndu[ rk ][ pk ];

			}

			const j1 = ( rk >= -1 ) ? 1 : - rk;
			const j2 = ( r - 1 <= pk ) ? k - 1 : p - r;

			for ( let j = j1; j <= j2; ++ j ) {

				a[ s2 ][ j ] = ( a[ s1 ][ j ] - a[ s1 ][ j - 1 ] ) / ndu[ pk + 1 ][ rk + j ];
				d += a[ s2 ][ j ] * ndu[ rk + j ][ pk ];

			}

			if ( r <= pk ) {

				a[ s2 ][ k ] = - a[ s1 ][ k - 1 ] / ndu[ pk + 1 ][ r ];
				d += a[ s2 ][ k ] * ndu[ r ][ pk ];

			}

			ders[ k ][ r ] = d;

			const j = s1;
			s1 = s2;
			s2 = j;

		}

	}

	let r = p;

	for ( let k = 1; k <= n; ++ k ) {

		for ( let j = 0; j <= p; ++ j ) {

			ders[ k ][ j ] *= r;

		}

		r *= p - k;

	}

	return ders;

}

/**
 * Calculates derivatives of a B-Spline. See The NURBS Book, page 93, algorithm A3.2.
 *
 * @param {number} p - The degree.
 * @param {Array<number>} U - The knot vector.
 * @param {Array<Vector4>} P - The control points
 * @param {number} u - The parametric point.
 * @param {number} nd - The number of derivatives.
 * @return {Array<Vector4>} An array[d+1] with derivatives.
 */
function calcBSplineDerivatives( p, U, P, u, nd ) {

	const du = nd < p ? nd : p;
	const CK = [];
	const span = findSpan( p, u, U );
	const nders = calcBasisFunctionDerivatives( span, u, p, du, U );
	const Pw = [];

	for ( let i = 0; i < P.length; ++ i ) {

		const point = P[ i ].clone();
		const w = point.w;

		point.x *= w;
		point.y *= w;
		point.z *= w;

		Pw[ i ] = point;

	}

	for ( let k = 0; k <= du; ++ k ) {

		const point = Pw[ span - p ].clone().multiplyScalar( nders[ k ][ 0 ] );

		for ( let j = 1; j <= p; ++ j ) {

			point.add( Pw[ span - p + j ].clone().multiplyScalar( nders[ k ][ j ] ) );

		}

		CK[ k ] = point;

	}

	for ( let k = du + 1; k <= nd + 1; ++ k ) {

		CK[ k ] = new Vector4( 0, 0, 0 );

	}

	return CK;

}

/**
 * Calculates "K over I".
 *
 * @param {number} k - The K value.
 * @param {number} i - The I value.
 * @return {number} k!/(i!(k-i)!)
 */
function calcKoverI( k, i ) {

	let nom = 1;

	for ( let j = 2; j <= k; ++ j ) {

		nom *= j;

	}

	let denom = 1;

	for ( let j = 2; j <= i; ++ j ) {

		denom *= j;

	}

	for ( let j = 2; j <= k - i; ++ j ) {

		denom *= j;

	}

	return nom / denom;

}

/**
 * Calculates derivatives (0-nd) of rational curve. See The NURBS Book, page 127, algorithm A4.2.
 *
 * @param {Array<Vector4>} Pders - Array with derivatives.
 * @return {Array<Vector3>} An array with derivatives for rational curve.
 */
function calcRationalCurveDerivatives( Pders ) {

	const nd = Pders.length;
	const Aders = [];
	const wders = [];

	for ( let i = 0; i < nd; ++ i ) {

		const point = Pders[ i ];
		Aders[ i ] = new Vector3( point.x, point.y, point.z );
		wders[ i ] = point.w;

	}

	const CK = [];

	for ( let k = 0; k < nd; ++ k ) {

		const v = Aders[ k ].clone();

		for ( let i = 1; i <= k; ++ i ) {

			v.sub( CK[ k - i ].clone().multiplyScalar( calcKoverI( k, i ) * wders[ i ] ) );

		}

		CK[ k ] = v.divideScalar( wders[ 0 ] );

	}

	return CK;

}

/**
 * Calculates NURBS curve derivatives. See The NURBS Book, page 127, algorithm A4.2.
 *
 * @param {number} p - The degree.
 * @param {Array<number>} U - The knot vector.
 * @param {Array<Vector4>} P - The control points in homogeneous space.
 * @param {number} u - The parametric point.
 * @param {number} nd - The number of derivatives.
 * @return {Array<Vector3>} array with derivatives for rational curve.
 */
function calcNURBSDerivatives( p, U, P, u, nd ) {

	const Pders = calcBSplineDerivatives( p, U, P, u, nd );
	return calcRationalCurveDerivatives( Pders );

}

/**
 * This class represents a NURBS curve.
 *
 * Implementation is based on `(x, y [, z=0 [, w=1]])` control points with `w=weight`.
 *
 * @augments Curve
 * @three_import import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
 */
class NURBSCurve extends Curve {

	/**
	 * Constructs a new NURBS curve.
	 *
	 * @param {number} degree - The NURBS degree.
	 * @param {Array<number>} knots - The knots as a flat array of numbers.
	 * @param {Array<Vector2|Vector3|Vector4>} controlPoints - An array holding control points.
	 * @param {number} [startKnot] - Index of the start knot into the `knots` array.
	 * @param {number} [endKnot] - Index of the end knot into the `knots` array.
	 */
	constructor( degree, knots, controlPoints, startKnot, endKnot ) {

		super();

		const knotsLength = knots ? knots.length - 1 : 0;
		const pointsLength = controlPoints ? controlPoints.length : 0;

		/**
		 * The NURBS degree.
		 *
		 * @type {number}
		 */
		this.degree = degree;

		/**
		 * The knots as a flat array of numbers.
		 *
		 * @type {Array<number>}
		 */
		this.knots = knots;

		/**
		 * An array of control points.
		 *
		 * @type {Array<Vector4>}
		 */
		this.controlPoints = [];

		/**
		 * Index of the start knot into the `knots` array.
		 *
		 * @type {number}
		 */
		this.startKnot = startKnot || 0;

		/**
		 * Index of the end knot into the `knots` array.
		 *
		 * @type {number}
		 */
		this.endKnot = endKnot || knotsLength;

		for ( let i = 0; i < pointsLength; ++ i ) {

			// ensure Vector4 for control points
			const point = controlPoints[ i ];
			this.controlPoints[ i ] = new Vector4( point.x, point.y, point.z, point.w );

		}

	}

	/**
	 * This method returns a vector in 3D space for the given interpolation factor.
	 *
	 * @param {number} t - A interpolation factor representing a position on the curve. Must be in the range `[0,1]`.
	 * @param {Vector3} [optionalTarget] - The optional target vector the result is written to.
	 * @return {Vector3} The position on the curve.
	 */
	getPoint( t, optionalTarget = new Vector3() ) {

		const point = optionalTarget;

		const u = this.knots[ this.startKnot ] + t * ( this.knots[ this.endKnot ] - this.knots[ this.startKnot ] ); // linear mapping t->u

		// following results in (wx, wy, wz, w) homogeneous point
		const hpoint = calcBSplinePoint( this.degree, this.knots, this.controlPoints, u );

		if ( hpoint.w !== 1.0 ) {

			// project to 3D space: (wx, wy, wz, w) -> (x, y, z, 1)
			hpoint.divideScalar( hpoint.w );

		}

		return point.set( hpoint.x, hpoint.y, hpoint.z );

	}

	/**
	 * Returns a unit vector tangent for the given interpolation factor.
	 *
	 * @param {number} t - The interpolation factor.
	 * @param {Vector3} [optionalTarget] - The optional target vector the result is written to.
	 * @return {Vector3} The tangent vector.
	 */
	getTangent( t, optionalTarget = new Vector3() ) {

		const tangent = optionalTarget;

		const u = this.knots[ 0 ] + t * ( this.knots[ this.knots.length - 1 ] - this.knots[ 0 ] );
		const ders = calcNURBSDerivatives( this.degree, this.knots, this.controlPoints, u, 1 );
		tangent.copy( ders[ 1 ] ).normalize();

		return tangent;

	}

	toJSON() {

		const data = super.toJSON();

		data.degree = this.degree;
		data.knots = [ ...this.knots ];
		data.controlPoints = this.controlPoints.map( p => p.toArray() );
		data.startKnot = this.startKnot;
		data.endKnot = this.endKnot;

		return data;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.degree = json.degree;
		this.knots = [ ...json.knots ];
		this.controlPoints = json.controlPoints.map( p => new Vector4( p[ 0 ], p[ 1 ], p[ 2 ], p[ 3 ] ) );
		this.startKnot = json.startKnot;
		this.endKnot = json.endKnot;

		return this;

	}

}

let fbxTree;
let connections;
let sceneGraph;
class FBXLoader extends Loader {
  /**
   * Constructs a new FBX loader.
   *
   * @param {LoadingManager} [manager] - The loading manager.
   */
  constructor(manager) {
    super(manager);
  }
  /**
   * Starts loading from the given URL and passes the loaded FBX asset
   * to the `onLoad()` callback.
   *
   * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
   * @param {function(Group)} onLoad - Executed when the loading process has been finished.
   * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
   * @param {onErrorCallback} onError - Executed when errors occur.
   */
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const path = scope.path === "" ? LoaderUtils.extractUrlBase(url) : scope.path;
    const loader = new FileLoader(this.manager);
    loader.setPath(scope.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(scope.requestHeader);
    loader.setWithCredentials(scope.withCredentials);
    loader.load(url, function(buffer) {
      try {
        onLoad(scope.parse(buffer, path));
      } catch (e) {
        if (onError) {
          onError(e);
        } else {
          console.error(e);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }
  /**
   * Parses the given FBX data and returns the resulting group.
   *
   * @param {ArrayBuffer} FBXBuffer - The raw FBX data as an array buffer.
   * @param {string} path - The URL base path.
   * @return {Group} An object representing the parsed asset.
   */
  parse(FBXBuffer, path) {
    if (isFbxFormatBinary(FBXBuffer)) {
      fbxTree = new BinaryParser().parse(FBXBuffer);
    } else {
      const FBXText = convertArrayBufferToString(FBXBuffer);
      if (!isFbxFormatASCII(FBXText)) {
        throw new Error("THREE.FBXLoader: Unknown format.");
      }
      if (getFbxVersion(FBXText) < 7e3) {
        throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: " + getFbxVersion(FBXText));
      }
      fbxTree = new TextParser().parse(FBXText);
    }
    const textureLoader = new TextureLoader(this.manager).setPath(this.resourcePath || path).setCrossOrigin(this.crossOrigin);
    return new FBXTreeParser(textureLoader, this.manager).parse(fbxTree);
  }
}
class FBXTreeParser {
  constructor(textureLoader, manager) {
    this.textureLoader = textureLoader;
    this.manager = manager;
  }
  parse() {
    connections = this.parseConnections();
    const images = this.parseImages();
    const textures = this.parseTextures(images);
    const materials = this.parseMaterials(textures);
    const deformers = this.parseDeformers();
    const geometryMap = new GeometryParser().parse(deformers);
    this.parseScene(deformers, geometryMap, materials);
    return sceneGraph;
  }
  // Parses FBXTree.Connections which holds parent-child connections between objects (e.g. material -> texture, model->geometry )
  // and details the connection type
  parseConnections() {
    const connectionMap = /* @__PURE__ */ new Map();
    if ("Connections" in fbxTree) {
      const rawConnections = fbxTree.Connections.connections;
      rawConnections.forEach(function(rawConnection) {
        const fromID = rawConnection[0];
        const toID = rawConnection[1];
        const relationship = rawConnection[2];
        if (!connectionMap.has(fromID)) {
          connectionMap.set(fromID, {
            parents: [],
            children: []
          });
        }
        const parentRelationship = { ID: toID, relationship };
        connectionMap.get(fromID).parents.push(parentRelationship);
        if (!connectionMap.has(toID)) {
          connectionMap.set(toID, {
            parents: [],
            children: []
          });
        }
        const childRelationship = { ID: fromID, relationship };
        connectionMap.get(toID).children.push(childRelationship);
      });
    }
    return connectionMap;
  }
  // Parse FBXTree.Objects.Video for embedded image data
  // These images are connected to textures in FBXTree.Objects.Textures
  // via FBXTree.Connections.
  parseImages() {
    const images = {};
    const blobs = {};
    if ("Video" in fbxTree.Objects) {
      const videoNodes = fbxTree.Objects.Video;
      for (const nodeID in videoNodes) {
        const videoNode = videoNodes[nodeID];
        const id = parseInt(nodeID);
        images[id] = videoNode.RelativeFilename || videoNode.Filename;
        if ("Content" in videoNode) {
          const arrayBufferContent = videoNode.Content instanceof ArrayBuffer && videoNode.Content.byteLength > 0;
          const base64Content = typeof videoNode.Content === "string" && videoNode.Content !== "";
          if (arrayBufferContent || base64Content) {
            const image = this.parseImage(videoNodes[nodeID]);
            blobs[videoNode.RelativeFilename || videoNode.Filename] = image;
          }
        }
      }
    }
    for (const id in images) {
      const filename = images[id];
      if (blobs[filename] !== void 0) images[id] = blobs[filename];
      else images[id] = images[id].split("\\").pop();
    }
    return images;
  }
  // Parse embedded image data in FBXTree.Video.Content
  parseImage(videoNode) {
    const content = videoNode.Content;
    const fileName = videoNode.RelativeFilename || videoNode.Filename;
    const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
    let type;
    switch (extension) {
      case "bmp":
        type = "image/bmp";
        break;
      case "jpg":
      case "jpeg":
        type = "image/jpeg";
        break;
      case "png":
        type = "image/png";
        break;
      case "tif":
        type = "image/tiff";
        break;
      case "tga":
        if (this.manager.getHandler(".tga") === null) {
          console.warn("FBXLoader: TGA loader not found, skipping ", fileName);
        }
        type = "image/tga";
        break;
      case "webp":
        type = "image/webp";
        break;
      default:
        console.warn('FBXLoader: Image type "' + extension + '" is not supported.');
        return;
    }
    if (typeof content === "string") {
      return "data:" + type + ";base64," + content;
    } else {
      const array = new Uint8Array(content);
      return window.URL.createObjectURL(new Blob([array], { type }));
    }
  }
  // Parse nodes in FBXTree.Objects.Texture
  // These contain details such as UV scaling, cropping, rotation etc and are connected
  // to images in FBXTree.Objects.Video
  parseTextures(images) {
    const textureMap = /* @__PURE__ */ new Map();
    if ("Texture" in fbxTree.Objects) {
      const textureNodes = fbxTree.Objects.Texture;
      for (const nodeID in textureNodes) {
        const texture = this.parseTexture(textureNodes[nodeID], images);
        textureMap.set(parseInt(nodeID), texture);
      }
    }
    return textureMap;
  }
  // Parse individual node in FBXTree.Objects.Texture
  parseTexture(textureNode, images) {
    const texture = this.loadTexture(textureNode, images);
    texture.ID = textureNode.id;
    texture.name = textureNode.attrName;
    const wrapModeU = textureNode.WrapModeU;
    const wrapModeV = textureNode.WrapModeV;
    const valueU = wrapModeU !== void 0 ? wrapModeU.value : 0;
    const valueV = wrapModeV !== void 0 ? wrapModeV.value : 0;
    texture.wrapS = valueU === 0 ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT = valueV === 0 ? RepeatWrapping : ClampToEdgeWrapping;
    if ("Scaling" in textureNode) {
      const values = textureNode.Scaling.value;
      texture.repeat.x = values[0];
      texture.repeat.y = values[1];
    }
    if ("Translation" in textureNode) {
      const values = textureNode.Translation.value;
      texture.offset.x = values[0];
      texture.offset.y = values[1];
    }
    return texture;
  }
  // load a texture specified as a blob or data URI, or via an external URL using TextureLoader
  loadTexture(textureNode, images) {
    const extension = textureNode.FileName.split(".").pop().toLowerCase();
    let loader = this.manager.getHandler(`.${extension}`);
    if (loader === null) loader = this.textureLoader;
    const loaderPath = loader.path;
    if (!loaderPath) {
      loader.setPath(this.textureLoader.path);
    }
    const children = connections.get(textureNode.id).children;
    let fileName;
    if (children !== void 0 && children.length > 0 && images[children[0].ID] !== void 0) {
      fileName = images[children[0].ID];
      if (fileName.indexOf("blob:") === 0 || fileName.indexOf("data:") === 0) {
        loader.setPath(void 0);
      }
    }
    if (fileName === void 0) {
      console.warn("FBXLoader: Undefined filename, creating placeholder texture.");
      return new Texture();
    }
    const texture = loader.load(fileName);
    loader.setPath(loaderPath);
    return texture;
  }
  // Parse nodes in FBXTree.Objects.Material
  parseMaterials(textureMap) {
    const materialMap = /* @__PURE__ */ new Map();
    if ("Material" in fbxTree.Objects) {
      const materialNodes = fbxTree.Objects.Material;
      for (const nodeID in materialNodes) {
        const material = this.parseMaterial(materialNodes[nodeID], textureMap);
        if (material !== null) materialMap.set(parseInt(nodeID), material);
      }
    }
    return materialMap;
  }
  // Parse single node in FBXTree.Objects.Material
  // Materials are connected to texture maps in FBXTree.Objects.Textures
  // FBX format currently only supports Lambert and Phong shading models
  parseMaterial(materialNode, textureMap) {
    const ID = materialNode.id;
    const name = materialNode.attrName;
    let type = materialNode.ShadingModel;
    if (typeof type === "object") {
      type = type.value;
    }
    if (!connections.has(ID)) return null;
    const parameters = this.parseParameters(materialNode, textureMap, ID);
    let material;
    switch (type.toLowerCase()) {
      case "phong":
        material = new MeshPhongMaterial();
        break;
      case "lambert":
        material = new MeshLambertMaterial();
        break;
      default:
        console.warn('THREE.FBXLoader: unknown material type "%s". Defaulting to MeshPhongMaterial.', type);
        material = new MeshPhongMaterial();
        break;
    }
    material.setValues(parameters);
    material.name = name;
    return material;
  }
  // Parse FBX material and return parameters suitable for a three.js material
  // Also parse the texture map and return any textures associated with the material
  parseParameters(materialNode, textureMap, ID) {
    const parameters = {};
    if (materialNode.BumpFactor) {
      parameters.bumpScale = materialNode.BumpFactor.value;
    }
    if (materialNode.Diffuse) {
      parameters.color = ColorManagement.colorSpaceToWorking(new Color().fromArray(materialNode.Diffuse.value), SRGBColorSpace);
    } else if (materialNode.DiffuseColor && (materialNode.DiffuseColor.type === "Color" || materialNode.DiffuseColor.type === "ColorRGB")) {
      parameters.color = ColorManagement.colorSpaceToWorking(new Color().fromArray(materialNode.DiffuseColor.value), SRGBColorSpace);
    }
    if (materialNode.DisplacementFactor) {
      parameters.displacementScale = materialNode.DisplacementFactor.value;
    }
    if (materialNode.Emissive) {
      parameters.emissive = ColorManagement.colorSpaceToWorking(new Color().fromArray(materialNode.Emissive.value), SRGBColorSpace);
    } else if (materialNode.EmissiveColor && (materialNode.EmissiveColor.type === "Color" || materialNode.EmissiveColor.type === "ColorRGB")) {
      parameters.emissive = ColorManagement.colorSpaceToWorking(new Color().fromArray(materialNode.EmissiveColor.value), SRGBColorSpace);
    }
    if (materialNode.EmissiveFactor) {
      parameters.emissiveIntensity = parseFloat(materialNode.EmissiveFactor.value);
    }
    parameters.opacity = 1 - (materialNode.TransparencyFactor ? parseFloat(materialNode.TransparencyFactor.value) : 0);
    if (parameters.opacity === 1 || parameters.opacity === 0) {
      parameters.opacity = materialNode.Opacity ? parseFloat(materialNode.Opacity.value) : null;
      if (parameters.opacity === null) {
        parameters.opacity = 1 - (materialNode.TransparentColor ? parseFloat(materialNode.TransparentColor.value[0]) : 0);
      }
    }
    if (parameters.opacity < 1) {
      parameters.transparent = true;
    }
    if (materialNode.ReflectionFactor) {
      parameters.reflectivity = materialNode.ReflectionFactor.value;
    }
    if (materialNode.Shininess) {
      parameters.shininess = materialNode.Shininess.value;
    }
    if (materialNode.Specular) {
      parameters.specular = ColorManagement.colorSpaceToWorking(new Color().fromArray(materialNode.Specular.value), SRGBColorSpace);
    } else if (materialNode.SpecularColor && materialNode.SpecularColor.type === "Color") {
      parameters.specular = ColorManagement.colorSpaceToWorking(new Color().fromArray(materialNode.SpecularColor.value), SRGBColorSpace);
    }
    const scope = this;
    connections.get(ID).children.forEach(function(child) {
      const type = child.relationship;
      switch (type) {
        case "Bump":
          parameters.bumpMap = scope.getTexture(textureMap, child.ID);
          break;
        case "Maya|TEX_ao_map":
          parameters.aoMap = scope.getTexture(textureMap, child.ID);
          break;
        case "DiffuseColor":
        case "Maya|TEX_color_map":
          parameters.map = scope.getTexture(textureMap, child.ID);
          if (parameters.map !== void 0) {
            parameters.map.colorSpace = SRGBColorSpace;
          }
          break;
        case "DisplacementColor":
          parameters.displacementMap = scope.getTexture(textureMap, child.ID);
          break;
        case "EmissiveColor":
          parameters.emissiveMap = scope.getTexture(textureMap, child.ID);
          if (parameters.emissiveMap !== void 0) {
            parameters.emissiveMap.colorSpace = SRGBColorSpace;
          }
          break;
        case "NormalMap":
        case "Maya|TEX_normal_map":
          parameters.normalMap = scope.getTexture(textureMap, child.ID);
          break;
        case "ReflectionColor":
          parameters.envMap = scope.getTexture(textureMap, child.ID);
          if (parameters.envMap !== void 0) {
            parameters.envMap.mapping = EquirectangularReflectionMapping;
            parameters.envMap.colorSpace = SRGBColorSpace;
          }
          break;
        case "SpecularColor":
          parameters.specularMap = scope.getTexture(textureMap, child.ID);
          if (parameters.specularMap !== void 0) {
            parameters.specularMap.colorSpace = SRGBColorSpace;
          }
          break;
        case "TransparentColor":
        case "TransparencyFactor":
          parameters.alphaMap = scope.getTexture(textureMap, child.ID);
          parameters.transparent = true;
          break;
        case "AmbientColor":
        case "ShininessExponent":
        // AKA glossiness map
        case "SpecularFactor":
        // AKA specularLevel
        case "VectorDisplacementColor":
        // NOTE: Seems to be a copy of DisplacementColor
        default:
          console.warn("THREE.FBXLoader: %s map is not supported in three.js, skipping texture.", type);
          break;
      }
    });
    return parameters;
  }
  // get a texture from the textureMap for use by a material.
  getTexture(textureMap, id) {
    if ("LayeredTexture" in fbxTree.Objects && id in fbxTree.Objects.LayeredTexture) {
      console.warn("THREE.FBXLoader: layered textures are not supported in three.js. Discarding all but first layer.");
      id = connections.get(id).children[0].ID;
    }
    return textureMap.get(id);
  }
  // Parse nodes in FBXTree.Objects.Deformer
  // Deformer node can contain skinning or Vertex Cache animation data, however only skinning is supported here
  // Generates map of Skeleton-like objects for use later when generating and binding skeletons.
  parseDeformers() {
    const skeletons = {};
    const morphTargets = {};
    if ("Deformer" in fbxTree.Objects) {
      const DeformerNodes = fbxTree.Objects.Deformer;
      for (const nodeID in DeformerNodes) {
        const deformerNode = DeformerNodes[nodeID];
        const relationships = connections.get(parseInt(nodeID));
        if (deformerNode.attrType === "Skin") {
          const skeleton = this.parseSkeleton(relationships, DeformerNodes);
          skeleton.ID = nodeID;
          if (relationships.parents.length > 1) console.warn("THREE.FBXLoader: skeleton attached to more than one geometry is not supported.");
          skeleton.geometryID = relationships.parents[0].ID;
          skeletons[nodeID] = skeleton;
        } else if (deformerNode.attrType === "BlendShape") {
          const morphTarget = {
            id: nodeID
          };
          morphTarget.rawTargets = this.parseMorphTargets(relationships, DeformerNodes);
          morphTarget.id = nodeID;
          if (relationships.parents.length > 1) console.warn("THREE.FBXLoader: morph target attached to more than one geometry is not supported.");
          morphTargets[nodeID] = morphTarget;
        }
      }
    }
    return {
      skeletons,
      morphTargets
    };
  }
  // Parse single nodes in FBXTree.Objects.Deformer
  // The top level skeleton node has type 'Skin' and sub nodes have type 'Cluster'
  // Each skin node represents a skeleton and each cluster node represents a bone
  parseSkeleton(relationships, deformerNodes) {
    const rawBones = [];
    relationships.children.forEach(function(child) {
      const boneNode = deformerNodes[child.ID];
      if (boneNode.attrType !== "Cluster") return;
      const rawBone = {
        ID: child.ID,
        indices: [],
        weights: [],
        transformLink: new Matrix4().fromArray(boneNode.TransformLink.a)
        // transform: new Matrix4().fromArray( boneNode.Transform.a ),
        // linkMode: boneNode.Mode,
      };
      if ("Indexes" in boneNode) {
        rawBone.indices = boneNode.Indexes.a;
        rawBone.weights = boneNode.Weights.a;
      }
      rawBones.push(rawBone);
    });
    return {
      rawBones,
      bones: []
    };
  }
  // The top level morph deformer node has type "BlendShape" and sub nodes have type "BlendShapeChannel"
  parseMorphTargets(relationships, deformerNodes) {
    const rawMorphTargets = [];
    for (let i = 0; i < relationships.children.length; i++) {
      const child = relationships.children[i];
      const morphTargetNode = deformerNodes[child.ID];
      const rawMorphTarget = {
        name: morphTargetNode.attrName,
        initialWeight: morphTargetNode.DeformPercent,
        id: morphTargetNode.id,
        fullWeights: morphTargetNode.FullWeights.a
      };
      if (morphTargetNode.attrType !== "BlendShapeChannel") return;
      rawMorphTarget.geoID = connections.get(parseInt(child.ID)).children.filter(function(child2) {
        return child2.relationship === void 0;
      })[0].ID;
      rawMorphTargets.push(rawMorphTarget);
    }
    return rawMorphTargets;
  }
  // create the main Group() to be returned by the loader
  parseScene(deformers, geometryMap, materialMap) {
    sceneGraph = new Group();
    const modelMap = this.parseModels(deformers.skeletons, geometryMap, materialMap);
    const modelNodes = fbxTree.Objects.Model;
    const scope = this;
    modelMap.forEach(function(model) {
      const modelNode = modelNodes[model.ID];
      scope.setLookAtProperties(model, modelNode);
      const parentConnections = connections.get(model.ID).parents;
      parentConnections.forEach(function(connection) {
        const parent = modelMap.get(connection.ID);
        if (parent !== void 0) parent.add(model);
      });
      if (model.parent === null) {
        sceneGraph.add(model);
      }
    });
    this.bindSkeleton(deformers.skeletons, geometryMap, modelMap);
    this.addGlobalSceneSettings();
    sceneGraph.traverse(function(node) {
      if (node.userData.transformData) {
        if (node.parent) {
          node.userData.transformData.parentMatrix = node.parent.matrix;
          node.userData.transformData.parentMatrixWorld = node.parent.matrixWorld;
        }
        const transform = generateTransform(node.userData.transformData);
        node.applyMatrix4(transform);
        node.updateWorldMatrix();
      }
    });
    const animations = new AnimationParser().parse();
    if (sceneGraph.children.length === 1 && sceneGraph.children[0].isGroup) {
      sceneGraph.children[0].animations = animations;
      sceneGraph = sceneGraph.children[0];
    }
    sceneGraph.animations = animations;
  }
  // parse nodes in FBXTree.Objects.Model
  parseModels(skeletons, geometryMap, materialMap) {
    const modelMap = /* @__PURE__ */ new Map();
    const modelNodes = fbxTree.Objects.Model;
    for (const nodeID in modelNodes) {
      const id = parseInt(nodeID);
      const node = modelNodes[nodeID];
      const relationships = connections.get(id);
      let model = this.buildSkeleton(relationships, skeletons, id, node.attrName);
      if (!model) {
        switch (node.attrType) {
          case "Camera":
            model = this.createCamera(relationships);
            break;
          case "Light":
            model = this.createLight(relationships);
            break;
          case "Mesh":
            model = this.createMesh(relationships, geometryMap, materialMap);
            break;
          case "NurbsCurve":
            model = this.createCurve(relationships, geometryMap);
            break;
          case "LimbNode":
          case "Root":
            model = new Bone();
            break;
          case "Null":
          default:
            model = new Group();
            break;
        }
        model.name = node.attrName ? PropertyBinding.sanitizeNodeName(node.attrName) : "";
        model.userData.originalName = node.attrName;
        model.ID = id;
      }
      this.getTransformData(model, node);
      modelMap.set(id, model);
    }
    return modelMap;
  }
  buildSkeleton(relationships, skeletons, id, name) {
    let bone = null;
    relationships.parents.forEach(function(parent) {
      for (const ID in skeletons) {
        const skeleton = skeletons[ID];
        skeleton.rawBones.forEach(function(rawBone, i) {
          if (rawBone.ID === parent.ID) {
            const subBone = bone;
            bone = new Bone();
            bone.matrixWorld.copy(rawBone.transformLink);
            bone.name = name ? PropertyBinding.sanitizeNodeName(name) : "";
            bone.userData.originalName = name;
            bone.ID = id;
            skeleton.bones[i] = bone;
            if (subBone !== null) {
              bone.add(subBone);
            }
          }
        });
      }
    });
    return bone;
  }
  // create a PerspectiveCamera or OrthographicCamera
  createCamera(relationships) {
    let model;
    let cameraAttribute;
    relationships.children.forEach(function(child) {
      const attr = fbxTree.Objects.NodeAttribute[child.ID];
      if (attr !== void 0) {
        cameraAttribute = attr;
      }
    });
    if (cameraAttribute === void 0) {
      model = new Object3D();
    } else {
      let type = 0;
      if (cameraAttribute.CameraProjectionType !== void 0 && cameraAttribute.CameraProjectionType.value === 1) {
        type = 1;
      }
      let nearClippingPlane = 1;
      if (cameraAttribute.NearPlane !== void 0) {
        nearClippingPlane = cameraAttribute.NearPlane.value / 1e3;
      }
      let farClippingPlane = 1e3;
      if (cameraAttribute.FarPlane !== void 0) {
        farClippingPlane = cameraAttribute.FarPlane.value / 1e3;
      }
      let width = window.innerWidth;
      let height = window.innerHeight;
      if (cameraAttribute.AspectWidth !== void 0 && cameraAttribute.AspectHeight !== void 0) {
        width = cameraAttribute.AspectWidth.value;
        height = cameraAttribute.AspectHeight.value;
      }
      const aspect = width / height;
      let fov = 45;
      if (cameraAttribute.FieldOfView !== void 0) {
        fov = cameraAttribute.FieldOfView.value;
      }
      const focalLength = cameraAttribute.FocalLength ? cameraAttribute.FocalLength.value : null;
      switch (type) {
        case 0:
          model = new PerspectiveCamera(fov, aspect, nearClippingPlane, farClippingPlane);
          if (focalLength !== null) model.setFocalLength(focalLength);
          break;
        case 1:
          console.warn("THREE.FBXLoader: Orthographic cameras not supported yet.");
          model = new Object3D();
          break;
        default:
          console.warn("THREE.FBXLoader: Unknown camera type " + type + ".");
          model = new Object3D();
          break;
      }
    }
    return model;
  }
  // Create a DirectionalLight, PointLight or SpotLight
  createLight(relationships) {
    let model;
    let lightAttribute;
    relationships.children.forEach(function(child) {
      const attr = fbxTree.Objects.NodeAttribute[child.ID];
      if (attr !== void 0) {
        lightAttribute = attr;
      }
    });
    if (lightAttribute === void 0) {
      model = new Object3D();
    } else {
      let type;
      if (lightAttribute.LightType === void 0) {
        type = 0;
      } else {
        type = lightAttribute.LightType.value;
      }
      let color = 16777215;
      if (lightAttribute.Color !== void 0) {
        color = ColorManagement.colorSpaceToWorking(new Color().fromArray(lightAttribute.Color.value), SRGBColorSpace);
      }
      let intensity = lightAttribute.Intensity === void 0 ? 1 : lightAttribute.Intensity.value / 100;
      if (lightAttribute.CastLightOnObject !== void 0 && lightAttribute.CastLightOnObject.value === 0) {
        intensity = 0;
      }
      let distance = 0;
      if (lightAttribute.FarAttenuationEnd !== void 0) {
        if (lightAttribute.EnableFarAttenuation !== void 0 && lightAttribute.EnableFarAttenuation.value === 0) {
          distance = 0;
        } else {
          distance = lightAttribute.FarAttenuationEnd.value;
        }
      }
      const decay = 1;
      switch (type) {
        case 0:
          model = new PointLight(color, intensity, distance, decay);
          break;
        case 1:
          model = new DirectionalLight(color, intensity);
          break;
        case 2:
          let angle = Math.PI / 3;
          if (lightAttribute.InnerAngle !== void 0) {
            angle = MathUtils.degToRad(lightAttribute.InnerAngle.value);
          }
          let penumbra = 0;
          if (lightAttribute.OuterAngle !== void 0) {
            penumbra = MathUtils.degToRad(lightAttribute.OuterAngle.value);
            penumbra = Math.max(penumbra, 1);
          }
          model = new SpotLight(color, intensity, distance, angle, penumbra, decay);
          break;
        default:
          console.warn("THREE.FBXLoader: Unknown light type " + lightAttribute.LightType.value + ", defaulting to a PointLight.");
          model = new PointLight(color, intensity);
          break;
      }
      if (lightAttribute.CastShadows !== void 0 && lightAttribute.CastShadows.value === 1) {
        model.castShadow = true;
      }
    }
    return model;
  }
  createMesh(relationships, geometryMap, materialMap) {
    let model;
    let geometry = null;
    let material = null;
    const materials = [];
    relationships.children.forEach(function(child) {
      if (geometryMap.has(child.ID)) {
        geometry = geometryMap.get(child.ID);
      }
      if (materialMap.has(child.ID)) {
        materials.push(materialMap.get(child.ID));
      }
    });
    if (materials.length > 1) {
      material = materials;
    } else if (materials.length > 0) {
      material = materials[0];
    } else {
      material = new MeshPhongMaterial({
        name: Loader.DEFAULT_MATERIAL_NAME,
        color: 13421772
      });
      materials.push(material);
    }
    if ("color" in geometry.attributes) {
      materials.forEach(function(material2) {
        material2.vertexColors = true;
      });
    }
    if (geometry.groups.length > 0) {
      let needsDefaultMaterial = false;
      for (let i = 0, il = geometry.groups.length; i < il; i++) {
        const group = geometry.groups[i];
        if (group.materialIndex < 0 || group.materialIndex >= materials.length) {
          group.materialIndex = materials.length;
          needsDefaultMaterial = true;
        }
      }
      if (needsDefaultMaterial) {
        const defaultMaterial = new MeshPhongMaterial();
        materials.push(defaultMaterial);
      }
    }
    if (geometry.FBX_Deformer) {
      model = new SkinnedMesh(geometry, material);
      model.normalizeSkinWeights();
    } else {
      model = new Mesh(geometry, material);
    }
    return model;
  }
  createCurve(relationships, geometryMap) {
    const geometry = relationships.children.reduce(function(geo, child) {
      if (geometryMap.has(child.ID)) geo = geometryMap.get(child.ID);
      return geo;
    }, null);
    const material = new LineBasicMaterial({
      name: Loader.DEFAULT_MATERIAL_NAME,
      color: 3342591,
      linewidth: 1
    });
    return new Line(geometry, material);
  }
  // parse the model node for transform data
  getTransformData(model, modelNode) {
    const transformData = {};
    if ("InheritType" in modelNode) transformData.inheritType = parseInt(modelNode.InheritType.value);
    if ("RotationOrder" in modelNode) transformData.eulerOrder = getEulerOrder(modelNode.RotationOrder.value);
    else transformData.eulerOrder = getEulerOrder(0);
    if ("Lcl_Translation" in modelNode) transformData.translation = modelNode.Lcl_Translation.value;
    if ("PreRotation" in modelNode) transformData.preRotation = modelNode.PreRotation.value;
    if ("Lcl_Rotation" in modelNode) transformData.rotation = modelNode.Lcl_Rotation.value;
    if ("PostRotation" in modelNode) transformData.postRotation = modelNode.PostRotation.value;
    if ("Lcl_Scaling" in modelNode) transformData.scale = modelNode.Lcl_Scaling.value;
    if ("ScalingOffset" in modelNode) transformData.scalingOffset = modelNode.ScalingOffset.value;
    if ("ScalingPivot" in modelNode) transformData.scalingPivot = modelNode.ScalingPivot.value;
    if ("RotationOffset" in modelNode) transformData.rotationOffset = modelNode.RotationOffset.value;
    if ("RotationPivot" in modelNode) transformData.rotationPivot = modelNode.RotationPivot.value;
    model.userData.transformData = transformData;
  }
  setLookAtProperties(model, modelNode) {
    if ("LookAtProperty" in modelNode) {
      const children = connections.get(model.ID).children;
      children.forEach(function(child) {
        if (child.relationship === "LookAtProperty") {
          const lookAtTarget = fbxTree.Objects.Model[child.ID];
          if ("Lcl_Translation" in lookAtTarget) {
            const pos = lookAtTarget.Lcl_Translation.value;
            if (model.target !== void 0) {
              model.target.position.fromArray(pos);
              sceneGraph.add(model.target);
            } else {
              model.lookAt(new Vector3().fromArray(pos));
            }
          }
        }
      });
    }
  }
  bindSkeleton(skeletons, geometryMap, modelMap) {
    const bindMatrices = this.parsePoseNodes();
    for (const ID in skeletons) {
      const skeleton = skeletons[ID];
      const parents = connections.get(parseInt(skeleton.ID)).parents;
      parents.forEach(function(parent) {
        if (geometryMap.has(parent.ID)) {
          const geoID = parent.ID;
          const geoRelationships = connections.get(geoID);
          geoRelationships.parents.forEach(function(geoConnParent) {
            if (modelMap.has(geoConnParent.ID)) {
              const model = modelMap.get(geoConnParent.ID);
              model.bind(new Skeleton(skeleton.bones), bindMatrices[geoConnParent.ID]);
            }
          });
        }
      });
    }
  }
  parsePoseNodes() {
    const bindMatrices = {};
    if ("Pose" in fbxTree.Objects) {
      const BindPoseNode = fbxTree.Objects.Pose;
      for (const nodeID in BindPoseNode) {
        if (BindPoseNode[nodeID].attrType === "BindPose" && BindPoseNode[nodeID].NbPoseNodes > 0) {
          const poseNodes = BindPoseNode[nodeID].PoseNode;
          if (Array.isArray(poseNodes)) {
            poseNodes.forEach(function(poseNode) {
              bindMatrices[poseNode.Node] = new Matrix4().fromArray(poseNode.Matrix.a);
            });
          } else {
            bindMatrices[poseNodes.Node] = new Matrix4().fromArray(poseNodes.Matrix.a);
          }
        }
      }
    }
    return bindMatrices;
  }
  addGlobalSceneSettings() {
    if ("GlobalSettings" in fbxTree) {
      if ("AmbientColor" in fbxTree.GlobalSettings) {
        const ambientColor = fbxTree.GlobalSettings.AmbientColor.value;
        const r = ambientColor[0];
        const g = ambientColor[1];
        const b = ambientColor[2];
        if (r !== 0 || g !== 0 || b !== 0) {
          const color = new Color().setRGB(r, g, b, SRGBColorSpace);
          sceneGraph.add(new AmbientLight(color, 1));
        }
      }
      if ("UnitScaleFactor" in fbxTree.GlobalSettings) {
        sceneGraph.userData.unitScaleFactor = fbxTree.GlobalSettings.UnitScaleFactor.value;
      }
    }
  }
}
class GeometryParser {
  constructor() {
    this.negativeMaterialIndices = false;
  }
  // Parse nodes in FBXTree.Objects.Geometry
  parse(deformers) {
    const geometryMap = /* @__PURE__ */ new Map();
    if ("Geometry" in fbxTree.Objects) {
      const geoNodes = fbxTree.Objects.Geometry;
      for (const nodeID in geoNodes) {
        const relationships = connections.get(parseInt(nodeID));
        const geo = this.parseGeometry(relationships, geoNodes[nodeID], deformers);
        geometryMap.set(parseInt(nodeID), geo);
      }
    }
    if (this.negativeMaterialIndices === true) {
      console.warn("THREE.FBXLoader: The FBX file contains invalid (negative) material indices. The asset might not render as expected.");
    }
    return geometryMap;
  }
  // Parse single node in FBXTree.Objects.Geometry
  parseGeometry(relationships, geoNode, deformers) {
    switch (geoNode.attrType) {
      case "Mesh":
        return this.parseMeshGeometry(relationships, geoNode, deformers);
      case "NurbsCurve":
        return this.parseNurbsGeometry(geoNode);
    }
  }
  // Parse single node mesh geometry in FBXTree.Objects.Geometry
  parseMeshGeometry(relationships, geoNode, deformers) {
    const skeletons = deformers.skeletons;
    const morphTargets = [];
    const modelNodes = relationships.parents.map(function(parent) {
      return fbxTree.Objects.Model[parent.ID];
    });
    if (modelNodes.length === 0) return;
    const skeleton = relationships.children.reduce(function(skeleton2, child) {
      if (skeletons[child.ID] !== void 0) skeleton2 = skeletons[child.ID];
      return skeleton2;
    }, null);
    relationships.children.forEach(function(child) {
      if (deformers.morphTargets[child.ID] !== void 0) {
        morphTargets.push(deformers.morphTargets[child.ID]);
      }
    });
    const modelNode = modelNodes[0];
    const transformData = {};
    if ("RotationOrder" in modelNode) transformData.eulerOrder = getEulerOrder(modelNode.RotationOrder.value);
    if ("InheritType" in modelNode) transformData.inheritType = parseInt(modelNode.InheritType.value);
    if ("GeometricTranslation" in modelNode) transformData.translation = modelNode.GeometricTranslation.value;
    if ("GeometricRotation" in modelNode) transformData.rotation = modelNode.GeometricRotation.value;
    if ("GeometricScaling" in modelNode) transformData.scale = modelNode.GeometricScaling.value;
    const transform = generateTransform(transformData);
    return this.genGeometry(geoNode, skeleton, morphTargets, transform);
  }
  // Generate a BufferGeometry from a node in FBXTree.Objects.Geometry
  genGeometry(geoNode, skeleton, morphTargets, preTransform) {
    const geo = new BufferGeometry();
    if (geoNode.attrName) geo.name = geoNode.attrName;
    const geoInfo = this.parseGeoNode(geoNode, skeleton);
    const buffers = this.genBuffers(geoInfo);
    const positionAttribute = new Float32BufferAttribute(buffers.vertex, 3);
    positionAttribute.applyMatrix4(preTransform);
    geo.setAttribute("position", positionAttribute);
    if (buffers.colors.length > 0) {
      geo.setAttribute("color", new Float32BufferAttribute(buffers.colors, 3));
    }
    if (skeleton) {
      geo.setAttribute("skinIndex", new Uint16BufferAttribute(buffers.weightsIndices, 4));
      geo.setAttribute("skinWeight", new Float32BufferAttribute(buffers.vertexWeights, 4));
      geo.FBX_Deformer = skeleton;
    }
    if (buffers.normal.length > 0) {
      const normalMatrix = new Matrix3().getNormalMatrix(preTransform);
      const normalAttribute = new Float32BufferAttribute(buffers.normal, 3);
      normalAttribute.applyNormalMatrix(normalMatrix);
      geo.setAttribute("normal", normalAttribute);
    }
    buffers.uvs.forEach(function(uvBuffer, i) {
      const name = i === 0 ? "uv" : `uv${i}`;
      geo.setAttribute(name, new Float32BufferAttribute(buffers.uvs[i], 2));
    });
    if (geoInfo.material && geoInfo.material.mappingType !== "AllSame") {
      let prevMaterialIndex = buffers.materialIndex[0];
      let startIndex = 0;
      buffers.materialIndex.forEach(function(currentIndex, i) {
        if (currentIndex !== prevMaterialIndex) {
          geo.addGroup(startIndex, i - startIndex, prevMaterialIndex);
          prevMaterialIndex = currentIndex;
          startIndex = i;
        }
      });
      if (geo.groups.length > 0) {
        const lastGroup = geo.groups[geo.groups.length - 1];
        const lastIndex = lastGroup.start + lastGroup.count;
        if (lastIndex !== buffers.materialIndex.length) {
          geo.addGroup(lastIndex, buffers.materialIndex.length - lastIndex, prevMaterialIndex);
        }
      }
      if (geo.groups.length === 0) {
        geo.addGroup(0, buffers.materialIndex.length, buffers.materialIndex[0]);
      }
    }
    this.addMorphTargets(geo, geoNode, morphTargets, preTransform);
    return geo;
  }
  parseGeoNode(geoNode, skeleton) {
    const geoInfo = {};
    geoInfo.vertexPositions = geoNode.Vertices !== void 0 ? geoNode.Vertices.a : [];
    geoInfo.vertexIndices = geoNode.PolygonVertexIndex !== void 0 ? geoNode.PolygonVertexIndex.a : [];
    if (geoNode.LayerElementColor && geoNode.LayerElementColor[0].Colors) {
      geoInfo.color = this.parseVertexColors(geoNode.LayerElementColor[0]);
    }
    if (geoNode.LayerElementMaterial) {
      geoInfo.material = this.parseMaterialIndices(geoNode.LayerElementMaterial[0]);
    }
    if (geoNode.LayerElementNormal) {
      geoInfo.normal = this.parseNormals(geoNode.LayerElementNormal[0]);
    }
    if (geoNode.LayerElementUV) {
      geoInfo.uv = [];
      let i = 0;
      while (geoNode.LayerElementUV[i]) {
        if (geoNode.LayerElementUV[i].UV) {
          geoInfo.uv.push(this.parseUVs(geoNode.LayerElementUV[i]));
        }
        i++;
      }
    }
    geoInfo.weightTable = {};
    if (skeleton !== null) {
      geoInfo.skeleton = skeleton;
      skeleton.rawBones.forEach(function(rawBone, i) {
        rawBone.indices.forEach(function(index, j) {
          if (geoInfo.weightTable[index] === void 0) geoInfo.weightTable[index] = [];
          geoInfo.weightTable[index].push({
            id: i,
            weight: rawBone.weights[j]
          });
        });
      });
    }
    return geoInfo;
  }
  genBuffers(geoInfo) {
    const buffers = {
      vertex: [],
      normal: [],
      colors: [],
      uvs: [],
      materialIndex: [],
      vertexWeights: [],
      weightsIndices: []
    };
    let polygonIndex = 0;
    let faceLength = 0;
    let displayedWeightsWarning = false;
    let facePositionIndexes = [];
    let faceNormals = [];
    let faceColors = [];
    let faceUVs = [];
    let faceWeights = [];
    let faceWeightIndices = [];
    const scope = this;
    geoInfo.vertexIndices.forEach(function(vertexIndex, polygonVertexIndex) {
      let materialIndex;
      let endOfFace = false;
      if (vertexIndex < 0) {
        vertexIndex = vertexIndex ^ -1;
        endOfFace = true;
      }
      let weightIndices = [];
      let weights = [];
      facePositionIndexes.push(vertexIndex * 3, vertexIndex * 3 + 1, vertexIndex * 3 + 2);
      if (geoInfo.color) {
        const data = getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.color);
        faceColors.push(data[0], data[1], data[2]);
      }
      if (geoInfo.skeleton) {
        if (geoInfo.weightTable[vertexIndex] !== void 0) {
          geoInfo.weightTable[vertexIndex].forEach(function(wt) {
            weights.push(wt.weight);
            weightIndices.push(wt.id);
          });
        }
        if (weights.length > 4) {
          if (!displayedWeightsWarning) {
            console.warn("THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights.");
            displayedWeightsWarning = true;
          }
          const wIndex = [0, 0, 0, 0];
          const Weight = [0, 0, 0, 0];
          weights.forEach(function(weight, weightIndex) {
            let currentWeight = weight;
            let currentIndex = weightIndices[weightIndex];
            Weight.forEach(function(comparedWeight, comparedWeightIndex, comparedWeightArray) {
              if (currentWeight > comparedWeight) {
                comparedWeightArray[comparedWeightIndex] = currentWeight;
                currentWeight = comparedWeight;
                const tmp = wIndex[comparedWeightIndex];
                wIndex[comparedWeightIndex] = currentIndex;
                currentIndex = tmp;
              }
            });
          });
          weightIndices = wIndex;
          weights = Weight;
        }
        while (weights.length < 4) {
          weights.push(0);
          weightIndices.push(0);
        }
        for (let i = 0; i < 4; ++i) {
          faceWeights.push(weights[i]);
          faceWeightIndices.push(weightIndices[i]);
        }
      }
      if (geoInfo.normal) {
        const data = getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.normal);
        faceNormals.push(data[0], data[1], data[2]);
      }
      if (geoInfo.material && geoInfo.material.mappingType !== "AllSame") {
        materialIndex = getData(polygonVertexIndex, polygonIndex, vertexIndex, geoInfo.material)[0];
        if (materialIndex < 0) {
          scope.negativeMaterialIndices = true;
          materialIndex = 0;
        }
      }
      if (geoInfo.uv) {
        geoInfo.uv.forEach(function(uv, i) {
          const data = getData(polygonVertexIndex, polygonIndex, vertexIndex, uv);
          if (faceUVs[i] === void 0) {
            faceUVs[i] = [];
          }
          faceUVs[i].push(data[0]);
          faceUVs[i].push(data[1]);
        });
      }
      faceLength++;
      if (endOfFace) {
        scope.genFace(buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength);
        polygonIndex++;
        faceLength = 0;
        facePositionIndexes = [];
        faceNormals = [];
        faceColors = [];
        faceUVs = [];
        faceWeights = [];
        faceWeightIndices = [];
      }
    });
    return buffers;
  }
  // See https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  getNormalNewell(vertices) {
    const normal = new Vector3(0, 0, 0);
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }
    normal.normalize();
    return normal;
  }
  getNormalTangentAndBitangent(vertices) {
    const normalVector = this.getNormalNewell(vertices);
    const up = Math.abs(normalVector.z) > 0.5 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const tangent = up.cross(normalVector).normalize();
    const bitangent = normalVector.clone().cross(tangent).normalize();
    return {
      normal: normalVector,
      tangent,
      bitangent
    };
  }
  flattenVertex(vertex, normalTangent, normalBitangent) {
    return new Vector2(
      vertex.dot(normalTangent),
      vertex.dot(normalBitangent)
    );
  }
  // Generate data for a single face in a geometry. If the face is a quad then split it into 2 tris
  genFace(buffers, geoInfo, facePositionIndexes, materialIndex, faceNormals, faceColors, faceUVs, faceWeights, faceWeightIndices, faceLength) {
    let triangles;
    if (faceLength > 3) {
      const vertices = [];
      const positions = geoInfo.baseVertexPositions || geoInfo.vertexPositions;
      for (let i = 0; i < facePositionIndexes.length; i += 3) {
        vertices.push(
          new Vector3(
            positions[facePositionIndexes[i]],
            positions[facePositionIndexes[i + 1]],
            positions[facePositionIndexes[i + 2]]
          )
        );
      }
      const { tangent, bitangent } = this.getNormalTangentAndBitangent(vertices);
      const triangulationInput = [];
      for (const vertex of vertices) {
        triangulationInput.push(this.flattenVertex(vertex, tangent, bitangent));
      }
      triangles = ShapeUtils.triangulateShape(triangulationInput, []);
    } else {
      triangles = [[0, 1, 2]];
    }
    for (const [i0, i1, i2] of triangles) {
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i0 * 3]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i0 * 3 + 1]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i0 * 3 + 2]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i1 * 3]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i1 * 3 + 1]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i1 * 3 + 2]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i2 * 3]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i2 * 3 + 1]]);
      buffers.vertex.push(geoInfo.vertexPositions[facePositionIndexes[i2 * 3 + 2]]);
      if (geoInfo.skeleton) {
        buffers.vertexWeights.push(faceWeights[i0 * 4]);
        buffers.vertexWeights.push(faceWeights[i0 * 4 + 1]);
        buffers.vertexWeights.push(faceWeights[i0 * 4 + 2]);
        buffers.vertexWeights.push(faceWeights[i0 * 4 + 3]);
        buffers.vertexWeights.push(faceWeights[i1 * 4]);
        buffers.vertexWeights.push(faceWeights[i1 * 4 + 1]);
        buffers.vertexWeights.push(faceWeights[i1 * 4 + 2]);
        buffers.vertexWeights.push(faceWeights[i1 * 4 + 3]);
        buffers.vertexWeights.push(faceWeights[i2 * 4]);
        buffers.vertexWeights.push(faceWeights[i2 * 4 + 1]);
        buffers.vertexWeights.push(faceWeights[i2 * 4 + 2]);
        buffers.vertexWeights.push(faceWeights[i2 * 4 + 3]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4 + 1]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4 + 2]);
        buffers.weightsIndices.push(faceWeightIndices[i0 * 4 + 3]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4 + 1]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4 + 2]);
        buffers.weightsIndices.push(faceWeightIndices[i1 * 4 + 3]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4 + 1]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4 + 2]);
        buffers.weightsIndices.push(faceWeightIndices[i2 * 4 + 3]);
      }
      if (geoInfo.color) {
        buffers.colors.push(faceColors[i0 * 3]);
        buffers.colors.push(faceColors[i0 * 3 + 1]);
        buffers.colors.push(faceColors[i0 * 3 + 2]);
        buffers.colors.push(faceColors[i1 * 3]);
        buffers.colors.push(faceColors[i1 * 3 + 1]);
        buffers.colors.push(faceColors[i1 * 3 + 2]);
        buffers.colors.push(faceColors[i2 * 3]);
        buffers.colors.push(faceColors[i2 * 3 + 1]);
        buffers.colors.push(faceColors[i2 * 3 + 2]);
      }
      if (geoInfo.material && geoInfo.material.mappingType !== "AllSame") {
        buffers.materialIndex.push(materialIndex);
        buffers.materialIndex.push(materialIndex);
        buffers.materialIndex.push(materialIndex);
      }
      if (geoInfo.normal) {
        buffers.normal.push(faceNormals[i0 * 3]);
        buffers.normal.push(faceNormals[i0 * 3 + 1]);
        buffers.normal.push(faceNormals[i0 * 3 + 2]);
        buffers.normal.push(faceNormals[i1 * 3]);
        buffers.normal.push(faceNormals[i1 * 3 + 1]);
        buffers.normal.push(faceNormals[i1 * 3 + 2]);
        buffers.normal.push(faceNormals[i2 * 3]);
        buffers.normal.push(faceNormals[i2 * 3 + 1]);
        buffers.normal.push(faceNormals[i2 * 3 + 2]);
      }
      if (geoInfo.uv) {
        geoInfo.uv.forEach(function(uv, j) {
          if (buffers.uvs[j] === void 0) buffers.uvs[j] = [];
          buffers.uvs[j].push(faceUVs[j][i0 * 2]);
          buffers.uvs[j].push(faceUVs[j][i0 * 2 + 1]);
          buffers.uvs[j].push(faceUVs[j][i1 * 2]);
          buffers.uvs[j].push(faceUVs[j][i1 * 2 + 1]);
          buffers.uvs[j].push(faceUVs[j][i2 * 2]);
          buffers.uvs[j].push(faceUVs[j][i2 * 2 + 1]);
        });
      }
    }
  }
  addMorphTargets(parentGeo, parentGeoNode, morphTargets, preTransform) {
    if (morphTargets.length === 0) return;
    parentGeo.morphTargetsRelative = true;
    parentGeo.morphAttributes.position = [];
    const scope = this;
    morphTargets.forEach(function(morphTarget) {
      morphTarget.rawTargets.forEach(function(rawTarget) {
        const morphGeoNode = fbxTree.Objects.Geometry[rawTarget.geoID];
        if (morphGeoNode !== void 0) {
          scope.genMorphGeometry(parentGeo, parentGeoNode, morphGeoNode, preTransform, rawTarget.name);
        }
      });
    });
  }
  // a morph geometry node is similar to a standard  node, and the node is also contained
  // in FBXTree.Objects.Geometry, however it can only have attributes for position, normal
  // and a special attribute Index defining which vertices of the original geometry are affected
  // Normal and position attributes only have data for the vertices that are affected by the morph
  genMorphGeometry(parentGeo, parentGeoNode, morphGeoNode, preTransform, name) {
    const basePositions = parentGeoNode.Vertices !== void 0 ? parentGeoNode.Vertices.a : [];
    const baseIndices = parentGeoNode.PolygonVertexIndex !== void 0 ? parentGeoNode.PolygonVertexIndex.a : [];
    const morphPositionsSparse = morphGeoNode.Vertices !== void 0 ? morphGeoNode.Vertices.a : [];
    const morphIndices = morphGeoNode.Indexes !== void 0 ? morphGeoNode.Indexes.a : [];
    const length = parentGeo.attributes.position.count * 3;
    const morphPositions = new Float32Array(length);
    for (let i = 0; i < morphIndices.length; i++) {
      const morphIndex = morphIndices[i] * 3;
      morphPositions[morphIndex] = morphPositionsSparse[i * 3];
      morphPositions[morphIndex + 1] = morphPositionsSparse[i * 3 + 1];
      morphPositions[morphIndex + 2] = morphPositionsSparse[i * 3 + 2];
    }
    const morphGeoInfo = {
      vertexIndices: baseIndices,
      vertexPositions: morphPositions,
      baseVertexPositions: basePositions
    };
    const morphBuffers = this.genBuffers(morphGeoInfo);
    const positionAttribute = new Float32BufferAttribute(morphBuffers.vertex, 3);
    positionAttribute.name = name || morphGeoNode.attrName;
    positionAttribute.applyMatrix4(preTransform);
    parentGeo.morphAttributes.position.push(positionAttribute);
  }
  // Parse normal from FBXTree.Objects.Geometry.LayerElementNormal if it exists
  parseNormals(NormalNode) {
    const mappingType = NormalNode.MappingInformationType;
    const referenceType = NormalNode.ReferenceInformationType;
    const buffer = NormalNode.Normals.a;
    let indexBuffer = [];
    if (referenceType === "IndexToDirect") {
      if ("NormalIndex" in NormalNode) {
        indexBuffer = NormalNode.NormalIndex.a;
      } else if ("NormalsIndex" in NormalNode) {
        indexBuffer = NormalNode.NormalsIndex.a;
      }
    }
    return {
      dataSize: 3,
      buffer,
      indices: indexBuffer,
      mappingType,
      referenceType
    };
  }
  // Parse UVs from FBXTree.Objects.Geometry.LayerElementUV if it exists
  parseUVs(UVNode) {
    const mappingType = UVNode.MappingInformationType;
    const referenceType = UVNode.ReferenceInformationType;
    const buffer = UVNode.UV.a;
    let indexBuffer = [];
    if (referenceType === "IndexToDirect") {
      indexBuffer = UVNode.UVIndex.a;
    }
    return {
      dataSize: 2,
      buffer,
      indices: indexBuffer,
      mappingType,
      referenceType
    };
  }
  // Parse Vertex Colors from FBXTree.Objects.Geometry.LayerElementColor if it exists
  parseVertexColors(ColorNode) {
    const mappingType = ColorNode.MappingInformationType;
    const referenceType = ColorNode.ReferenceInformationType;
    const buffer = ColorNode.Colors.a;
    let indexBuffer = [];
    if (referenceType === "IndexToDirect") {
      indexBuffer = ColorNode.ColorIndex.a;
    }
    for (let i = 0, c = new Color(); i < buffer.length; i += 4) {
      c.fromArray(buffer, i);
      ColorManagement.colorSpaceToWorking(c, SRGBColorSpace);
      c.toArray(buffer, i);
    }
    return {
      dataSize: 4,
      buffer,
      indices: indexBuffer,
      mappingType,
      referenceType
    };
  }
  // Parse mapping and material data in FBXTree.Objects.Geometry.LayerElementMaterial if it exists
  parseMaterialIndices(MaterialNode) {
    const mappingType = MaterialNode.MappingInformationType;
    const referenceType = MaterialNode.ReferenceInformationType;
    if (mappingType === "NoMappingInformation") {
      return {
        dataSize: 1,
        buffer: [0],
        indices: [0],
        mappingType: "AllSame",
        referenceType
      };
    }
    const materialIndexBuffer = MaterialNode.Materials.a;
    const materialIndices = [];
    for (let i = 0; i < materialIndexBuffer.length; ++i) {
      materialIndices.push(i);
    }
    return {
      dataSize: 1,
      buffer: materialIndexBuffer,
      indices: materialIndices,
      mappingType,
      referenceType
    };
  }
  // Generate a NurbGeometry from a node in FBXTree.Objects.Geometry
  parseNurbsGeometry(geoNode) {
    const order = parseInt(geoNode.Order);
    if (isNaN(order)) {
      console.error("THREE.FBXLoader: Invalid Order %s given for geometry ID: %s", geoNode.Order, geoNode.id);
      return new BufferGeometry();
    }
    const degree = order - 1;
    const knots = geoNode.KnotVector.a;
    const controlPoints = [];
    const pointsValues = geoNode.Points.a;
    for (let i = 0, l = pointsValues.length; i < l; i += 4) {
      controlPoints.push(new Vector4().fromArray(pointsValues, i));
    }
    let startKnot, endKnot;
    if (geoNode.Form === "Closed") {
      controlPoints.push(controlPoints[0]);
    } else if (geoNode.Form === "Periodic") {
      startKnot = degree;
      endKnot = knots.length - 1 - startKnot;
      for (let i = 0; i < degree; ++i) {
        controlPoints.push(controlPoints[i]);
      }
    }
    const curve = new NURBSCurve(degree, knots, controlPoints, startKnot, endKnot);
    const points = curve.getPoints(controlPoints.length * 12);
    return new BufferGeometry().setFromPoints(points);
  }
}
class AnimationParser {
  // take raw animation clips and turn them into three.js animation clips
  parse() {
    const animationClips = [];
    const rawClips = this.parseClips();
    if (rawClips !== void 0) {
      for (const key in rawClips) {
        const rawClip = rawClips[key];
        const clip = this.addClip(rawClip);
        animationClips.push(clip);
      }
    }
    return animationClips;
  }
  parseClips() {
    if (fbxTree.Objects.AnimationCurve === void 0) return void 0;
    const curveNodesMap = this.parseAnimationCurveNodes();
    this.parseAnimationCurves(curveNodesMap);
    const layersMap = this.parseAnimationLayers(curveNodesMap);
    const rawClips = this.parseAnimStacks(layersMap);
    return rawClips;
  }
  // parse nodes in FBXTree.Objects.AnimationCurveNode
  // each AnimationCurveNode holds data for an animation transform for a model (e.g. left arm rotation )
  // and is referenced by an AnimationLayer
  parseAnimationCurveNodes() {
    const rawCurveNodes = fbxTree.Objects.AnimationCurveNode;
    const curveNodesMap = /* @__PURE__ */ new Map();
    for (const nodeID in rawCurveNodes) {
      const rawCurveNode = rawCurveNodes[nodeID];
      if (rawCurveNode.attrName.match(/S|R|T|DeformPercent/) !== null) {
        const curveNode = {
          id: rawCurveNode.id,
          attr: rawCurveNode.attrName,
          curves: {}
        };
        curveNodesMap.set(curveNode.id, curveNode);
      }
    }
    return curveNodesMap;
  }
  // parse nodes in FBXTree.Objects.AnimationCurve and connect them up to
  // previously parsed AnimationCurveNodes. Each AnimationCurve holds data for a single animated
  // axis ( e.g. times and values of x rotation)
  parseAnimationCurves(curveNodesMap) {
    const rawCurves = fbxTree.Objects.AnimationCurve;
    for (const nodeID in rawCurves) {
      const animationCurve = {
        id: rawCurves[nodeID].id,
        times: rawCurves[nodeID].KeyTime.a.map(convertFBXTimeToSeconds),
        values: rawCurves[nodeID].KeyValueFloat.a
      };
      const relationships = connections.get(animationCurve.id);
      if (relationships !== void 0) {
        const animationCurveID = relationships.parents[0].ID;
        const animationCurveRelationship = relationships.parents[0].relationship;
        if (animationCurveRelationship.match(/X/)) {
          curveNodesMap.get(animationCurveID).curves["x"] = animationCurve;
        } else if (animationCurveRelationship.match(/Y/)) {
          curveNodesMap.get(animationCurveID).curves["y"] = animationCurve;
        } else if (animationCurveRelationship.match(/Z/)) {
          curveNodesMap.get(animationCurveID).curves["z"] = animationCurve;
        } else if (animationCurveRelationship.match(/DeformPercent/) && curveNodesMap.has(animationCurveID)) {
          curveNodesMap.get(animationCurveID).curves["morph"] = animationCurve;
        }
      }
    }
  }
  // parse nodes in FBXTree.Objects.AnimationLayer. Each layers holds references
  // to various AnimationCurveNodes and is referenced by an AnimationStack node
  // note: theoretically a stack can have multiple layers, however in practice there always seems to be one per stack
  parseAnimationLayers(curveNodesMap) {
    const rawLayers = fbxTree.Objects.AnimationLayer;
    const layersMap = /* @__PURE__ */ new Map();
    for (const nodeID in rawLayers) {
      const layerCurveNodes = [];
      const connection = connections.get(parseInt(nodeID));
      if (connection !== void 0) {
        const children = connection.children;
        children.forEach(function(child, i) {
          if (curveNodesMap.has(child.ID)) {
            const curveNode = curveNodesMap.get(child.ID);
            if (curveNode.curves.x !== void 0 || curveNode.curves.y !== void 0 || curveNode.curves.z !== void 0) {
              if (layerCurveNodes[i] === void 0) {
                const modelID = connections.get(child.ID).parents.filter(function(parent) {
                  return parent.relationship !== void 0;
                })[0].ID;
                if (modelID !== void 0) {
                  const rawModel = fbxTree.Objects.Model[modelID.toString()];
                  if (rawModel === void 0) {
                    console.warn("THREE.FBXLoader: Encountered a unused curve.", child);
                    return;
                  }
                  const node = {
                    modelName: rawModel.attrName ? PropertyBinding.sanitizeNodeName(rawModel.attrName) : "",
                    ID: rawModel.id,
                    initialPosition: [0, 0, 0],
                    initialRotation: [0, 0, 0],
                    initialScale: [1, 1, 1]
                  };
                  sceneGraph.traverse(function(child2) {
                    if (child2.ID === rawModel.id) {
                      node.transform = child2.matrix;
                      if (child2.userData.transformData) node.eulerOrder = child2.userData.transformData.eulerOrder;
                    }
                  });
                  if (!node.transform) node.transform = new Matrix4();
                  if ("PreRotation" in rawModel) node.preRotation = rawModel.PreRotation.value;
                  if ("PostRotation" in rawModel) node.postRotation = rawModel.PostRotation.value;
                  layerCurveNodes[i] = node;
                }
              }
              if (layerCurveNodes[i]) layerCurveNodes[i][curveNode.attr] = curveNode;
            } else if (curveNode.curves.morph !== void 0) {
              if (layerCurveNodes[i] === void 0) {
                const deformerID = connections.get(child.ID).parents.filter(function(parent) {
                  return parent.relationship !== void 0;
                })[0].ID;
                const morpherID = connections.get(deformerID).parents[0].ID;
                const geoID = connections.get(morpherID).parents[0].ID;
                const modelID = connections.get(geoID).parents[0].ID;
                const rawModel = fbxTree.Objects.Model[modelID];
                const node = {
                  modelName: rawModel.attrName ? PropertyBinding.sanitizeNodeName(rawModel.attrName) : "",
                  morphName: fbxTree.Objects.Deformer[deformerID].attrName
                };
                layerCurveNodes[i] = node;
              }
              layerCurveNodes[i][curveNode.attr] = curveNode;
            }
          }
        });
        layersMap.set(parseInt(nodeID), layerCurveNodes);
      }
    }
    return layersMap;
  }
  // parse nodes in FBXTree.Objects.AnimationStack. These are the top level node in the animation
  // hierarchy. Each Stack node will be used to create an AnimationClip
  parseAnimStacks(layersMap) {
    const rawStacks = fbxTree.Objects.AnimationStack;
    const rawClips = {};
    for (const nodeID in rawStacks) {
      const children = connections.get(parseInt(nodeID)).children;
      if (children.length > 1) {
        console.warn("THREE.FBXLoader: Encountered an animation stack with multiple layers, this is currently not supported. Ignoring subsequent layers.");
      }
      const layer = layersMap.get(children[0].ID);
      rawClips[nodeID] = {
        name: rawStacks[nodeID].attrName,
        layer
      };
    }
    return rawClips;
  }
  addClip(rawClip) {
    let tracks = [];
    const scope = this;
    rawClip.layer.forEach(function(rawTracks) {
      tracks = tracks.concat(scope.generateTracks(rawTracks));
    });
    return new AnimationClip(rawClip.name, -1, tracks);
  }
  generateTracks(rawTracks) {
    const tracks = [];
    let initialPosition = new Vector3();
    let initialScale = new Vector3();
    if (rawTracks.transform) rawTracks.transform.decompose(initialPosition, new Quaternion(), initialScale);
    initialPosition = initialPosition.toArray();
    initialScale = initialScale.toArray();
    if (rawTracks.T !== void 0 && Object.keys(rawTracks.T.curves).length > 0) {
      const positionTrack = this.generateVectorTrack(rawTracks.modelName, rawTracks.T.curves, initialPosition, "position");
      if (positionTrack !== void 0) tracks.push(positionTrack);
    }
    if (rawTracks.R !== void 0 && Object.keys(rawTracks.R.curves).length > 0) {
      const rotationTrack = this.generateRotationTrack(rawTracks.modelName, rawTracks.R.curves, rawTracks.preRotation, rawTracks.postRotation, rawTracks.eulerOrder);
      if (rotationTrack !== void 0) tracks.push(rotationTrack);
    }
    if (rawTracks.S !== void 0 && Object.keys(rawTracks.S.curves).length > 0) {
      const scaleTrack = this.generateVectorTrack(rawTracks.modelName, rawTracks.S.curves, initialScale, "scale");
      if (scaleTrack !== void 0) tracks.push(scaleTrack);
    }
    if (rawTracks.DeformPercent !== void 0) {
      const morphTrack = this.generateMorphTrack(rawTracks);
      if (morphTrack !== void 0) tracks.push(morphTrack);
    }
    return tracks;
  }
  generateVectorTrack(modelName, curves, initialValue, type) {
    const times = this.getTimesForAllAxes(curves);
    const values = this.getKeyframeTrackValues(times, curves, initialValue);
    return new VectorKeyframeTrack(modelName + "." + type, times, values);
  }
  generateRotationTrack(modelName, curves, preRotation, postRotation, eulerOrder) {
    let times;
    let values;
    if (curves.x !== void 0 && curves.y !== void 0 && curves.z !== void 0) {
      const result = this.interpolateRotations(curves.x, curves.y, curves.z, eulerOrder);
      times = result[0];
      values = result[1];
    }
    const defaultEulerOrder = getEulerOrder(0);
    if (preRotation !== void 0) {
      preRotation = preRotation.map(MathUtils.degToRad);
      preRotation.push(defaultEulerOrder);
      preRotation = new Euler().fromArray(preRotation);
      preRotation = new Quaternion().setFromEuler(preRotation);
    }
    if (postRotation !== void 0) {
      postRotation = postRotation.map(MathUtils.degToRad);
      postRotation.push(defaultEulerOrder);
      postRotation = new Euler().fromArray(postRotation);
      postRotation = new Quaternion().setFromEuler(postRotation).invert();
    }
    const quaternion = new Quaternion();
    const euler = new Euler();
    const quaternionValues = [];
    if (!values || !times) return new QuaternionKeyframeTrack(modelName + ".quaternion", [0], [0]);
    for (let i = 0; i < values.length; i += 3) {
      euler.set(values[i], values[i + 1], values[i + 2], eulerOrder);
      quaternion.setFromEuler(euler);
      if (preRotation !== void 0) quaternion.premultiply(preRotation);
      if (postRotation !== void 0) quaternion.multiply(postRotation);
      if (i > 2) {
        const prevQuat = new Quaternion().fromArray(
          quaternionValues,
          (i - 3) / 3 * 4
        );
        if (prevQuat.dot(quaternion) < 0) {
          quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        }
      }
      quaternion.toArray(quaternionValues, i / 3 * 4);
    }
    return new QuaternionKeyframeTrack(modelName + ".quaternion", times, quaternionValues);
  }
  generateMorphTrack(rawTracks) {
    const curves = rawTracks.DeformPercent.curves.morph;
    const values = curves.values.map(function(val) {
      return val / 100;
    });
    const morphNum = sceneGraph.getObjectByName(rawTracks.modelName).morphTargetDictionary[rawTracks.morphName];
    return new NumberKeyframeTrack(rawTracks.modelName + ".morphTargetInfluences[" + morphNum + "]", curves.times, values);
  }
  // For all animated objects, times are defined separately for each axis
  // Here we'll combine the times into one sorted array without duplicates
  getTimesForAllAxes(curves) {
    let times = [];
    if (curves.x !== void 0) times = times.concat(curves.x.times);
    if (curves.y !== void 0) times = times.concat(curves.y.times);
    if (curves.z !== void 0) times = times.concat(curves.z.times);
    times = times.sort(function(a, b) {
      return a - b;
    });
    if (times.length > 1) {
      let targetIndex = 1;
      let lastValue = times[0];
      for (let i = 1; i < times.length; i++) {
        const currentValue = times[i];
        if (currentValue !== lastValue) {
          times[targetIndex] = currentValue;
          lastValue = currentValue;
          targetIndex++;
        }
      }
      times = times.slice(0, targetIndex);
    }
    return times;
  }
  getKeyframeTrackValues(times, curves, initialValue) {
    const prevValue = initialValue;
    const values = [];
    let xIndex = -1;
    let yIndex = -1;
    let zIndex = -1;
    times.forEach(function(time) {
      if (curves.x) xIndex = curves.x.times.indexOf(time);
      if (curves.y) yIndex = curves.y.times.indexOf(time);
      if (curves.z) zIndex = curves.z.times.indexOf(time);
      if (xIndex !== -1) {
        const xValue = curves.x.values[xIndex];
        values.push(xValue);
        prevValue[0] = xValue;
      } else {
        values.push(prevValue[0]);
      }
      if (yIndex !== -1) {
        const yValue = curves.y.values[yIndex];
        values.push(yValue);
        prevValue[1] = yValue;
      } else {
        values.push(prevValue[1]);
      }
      if (zIndex !== -1) {
        const zValue = curves.z.values[zIndex];
        values.push(zValue);
        prevValue[2] = zValue;
      } else {
        values.push(prevValue[2]);
      }
    });
    return values;
  }
  // Rotations are defined as Euler angles which can have values  of any size
  // These will be converted to quaternions which don't support values greater than
  // PI, so we'll interpolate large rotations
  interpolateRotations(curvex, curvey, curvez, eulerOrder) {
    const times = [];
    const values = [];
    times.push(curvex.times[0]);
    values.push(MathUtils.degToRad(curvex.values[0]));
    values.push(MathUtils.degToRad(curvey.values[0]));
    values.push(MathUtils.degToRad(curvez.values[0]));
    for (let i = 1; i < curvex.values.length; i++) {
      const initialValue = [
        curvex.values[i - 1],
        curvey.values[i - 1],
        curvez.values[i - 1]
      ];
      if (isNaN(initialValue[0]) || isNaN(initialValue[1]) || isNaN(initialValue[2])) {
        continue;
      }
      const initialValueRad = initialValue.map(MathUtils.degToRad);
      const currentValue = [
        curvex.values[i],
        curvey.values[i],
        curvez.values[i]
      ];
      if (isNaN(currentValue[0]) || isNaN(currentValue[1]) || isNaN(currentValue[2])) {
        continue;
      }
      const currentValueRad = currentValue.map(MathUtils.degToRad);
      const valuesSpan = [
        currentValue[0] - initialValue[0],
        currentValue[1] - initialValue[1],
        currentValue[2] - initialValue[2]
      ];
      const absoluteSpan = [
        Math.abs(valuesSpan[0]),
        Math.abs(valuesSpan[1]),
        Math.abs(valuesSpan[2])
      ];
      if (absoluteSpan[0] >= 180 || absoluteSpan[1] >= 180 || absoluteSpan[2] >= 180) {
        const maxAbsSpan = Math.max(...absoluteSpan);
        const numSubIntervals = maxAbsSpan / 180;
        const E1 = new Euler(...initialValueRad, eulerOrder);
        const E2 = new Euler(...currentValueRad, eulerOrder);
        const Q1 = new Quaternion().setFromEuler(E1);
        const Q2 = new Quaternion().setFromEuler(E2);
        if (Q1.dot(Q2)) {
          Q2.set(-Q2.x, -Q2.y, -Q2.z, -Q2.w);
        }
        const initialTime = curvex.times[i - 1];
        const timeSpan = curvex.times[i] - initialTime;
        const Q = new Quaternion();
        const E = new Euler();
        for (let t = 0; t < 1; t += 1 / numSubIntervals) {
          Q.copy(Q1.clone().slerp(Q2.clone(), t));
          times.push(initialTime + t * timeSpan);
          E.setFromQuaternion(Q, eulerOrder);
          values.push(E.x);
          values.push(E.y);
          values.push(E.z);
        }
      } else {
        times.push(curvex.times[i]);
        values.push(MathUtils.degToRad(curvex.values[i]));
        values.push(MathUtils.degToRad(curvey.values[i]));
        values.push(MathUtils.degToRad(curvez.values[i]));
      }
    }
    return [times, values];
  }
}
class TextParser {
  getPrevNode() {
    return this.nodeStack[this.currentIndent - 2];
  }
  getCurrentNode() {
    return this.nodeStack[this.currentIndent - 1];
  }
  getCurrentProp() {
    return this.currentProp;
  }
  pushStack(node) {
    this.nodeStack.push(node);
    this.currentIndent += 1;
  }
  popStack() {
    this.nodeStack.pop();
    this.currentIndent -= 1;
  }
  setCurrentProp(val, name) {
    this.currentProp = val;
    this.currentPropName = name;
  }
  parse(text) {
    this.currentIndent = 0;
    this.allNodes = new FBXTree();
    this.nodeStack = [];
    this.currentProp = [];
    this.currentPropName = "";
    const scope = this;
    const split = text.split(/[\r\n]+/);
    split.forEach(function(line, i) {
      const matchComment = line.match(/^[\s\t]*;/);
      const matchEmpty = line.match(/^[\s\t]*$/);
      if (matchComment || matchEmpty) return;
      const matchBeginning = line.match("^\\t{" + scope.currentIndent + "}(\\w+):(.*){", "");
      const matchProperty = line.match("^\\t{" + scope.currentIndent + "}(\\w+):[\\s\\t\\r\\n](.*)");
      const matchEnd = line.match("^\\t{" + (scope.currentIndent - 1) + "}}");
      if (matchBeginning) {
        scope.parseNodeBegin(line, matchBeginning);
      } else if (matchProperty) {
        scope.parseNodeProperty(line, matchProperty, split[++i]);
      } else if (matchEnd) {
        scope.popStack();
      } else if (line.match(/^[^\s\t}]/)) {
        scope.parseNodePropertyContinued(line);
      }
    });
    return this.allNodes;
  }
  parseNodeBegin(line, property) {
    const nodeName = property[1].trim().replace(/^"/, "").replace(/"$/, "");
    const nodeAttrs = property[2].split(",").map(function(attr) {
      return attr.trim().replace(/^"/, "").replace(/"$/, "");
    });
    const node = { name: nodeName };
    const attrs = this.parseNodeAttr(nodeAttrs);
    const currentNode = this.getCurrentNode();
    if (this.currentIndent === 0) {
      this.allNodes.add(nodeName, node);
    } else {
      if (nodeName in currentNode) {
        if (nodeName === "PoseNode") {
          currentNode.PoseNode.push(node);
        } else if (currentNode[nodeName].id !== void 0) {
          currentNode[nodeName] = {};
          currentNode[nodeName][currentNode[nodeName].id] = currentNode[nodeName];
        }
        if (attrs.id !== "") currentNode[nodeName][attrs.id] = node;
      } else if (typeof attrs.id === "number") {
        currentNode[nodeName] = {};
        currentNode[nodeName][attrs.id] = node;
      } else if (nodeName !== "Properties70") {
        if (nodeName === "PoseNode") currentNode[nodeName] = [node];
        else currentNode[nodeName] = node;
      }
    }
    if (typeof attrs.id === "number") node.id = attrs.id;
    if (attrs.name !== "") node.attrName = attrs.name;
    if (attrs.type !== "") node.attrType = attrs.type;
    this.pushStack(node);
  }
  parseNodeAttr(attrs) {
    let id = attrs[0];
    if (attrs[0] !== "") {
      id = parseInt(attrs[0]);
      if (isNaN(id)) {
        id = attrs[0];
      }
    }
    let name = "", type = "";
    if (attrs.length > 1) {
      name = attrs[1].replace(/^(\w+)::/, "");
      type = attrs[2];
    }
    return { id, name, type };
  }
  parseNodeProperty(line, property, contentLine) {
    let propName = property[1].replace(/^"/, "").replace(/"$/, "").trim();
    let propValue = property[2].replace(/^"/, "").replace(/"$/, "").trim();
    if (propName === "Content" && propValue === ",") {
      propValue = contentLine.replace(/"/g, "").replace(/,$/, "").trim();
    }
    const currentNode = this.getCurrentNode();
    const parentName = currentNode.name;
    if (parentName === "Properties70") {
      this.parseNodeSpecialProperty(line, propName, propValue);
      return;
    }
    if (propName === "C") {
      const connProps = propValue.split(",").slice(1);
      const from = parseInt(connProps[0]);
      const to = parseInt(connProps[1]);
      let rest = propValue.split(",").slice(3);
      rest = rest.map(function(elem) {
        return elem.trim().replace(/^"/, "");
      });
      propName = "connections";
      propValue = [from, to];
      append(propValue, rest);
      if (currentNode[propName] === void 0) {
        currentNode[propName] = [];
      }
    }
    if (propName === "Node") currentNode.id = propValue;
    if (propName in currentNode && Array.isArray(currentNode[propName])) {
      currentNode[propName].push(propValue);
    } else {
      if (propName !== "a") currentNode[propName] = propValue;
      else currentNode.a = propValue;
    }
    this.setCurrentProp(currentNode, propName);
    if (propName === "a" && propValue.slice(-1) !== ",") {
      currentNode.a = parseNumberArray(propValue);
    }
  }
  parseNodePropertyContinued(line) {
    const currentNode = this.getCurrentNode();
    currentNode.a += line;
    if (line.slice(-1) !== ",") {
      currentNode.a = parseNumberArray(currentNode.a);
    }
  }
  // parse "Property70"
  parseNodeSpecialProperty(line, propName, propValue) {
    const props = propValue.split('",').map(function(prop) {
      return prop.trim().replace(/^\"/, "").replace(/\s/, "_");
    });
    const innerPropName = props[0];
    const innerPropType1 = props[1];
    const innerPropType2 = props[2];
    const innerPropFlag = props[3];
    let innerPropValue = props[4];
    switch (innerPropType1) {
      case "int":
      case "enum":
      case "bool":
      case "ULongLong":
      case "double":
      case "Number":
      case "FieldOfView":
        innerPropValue = parseFloat(innerPropValue);
        break;
      case "Color":
      case "ColorRGB":
      case "Vector3D":
      case "Lcl_Translation":
      case "Lcl_Rotation":
      case "Lcl_Scaling":
        innerPropValue = parseNumberArray(innerPropValue);
        break;
    }
    this.getPrevNode()[innerPropName] = {
      "type": innerPropType1,
      "type2": innerPropType2,
      "flag": innerPropFlag,
      "value": innerPropValue
    };
    this.setCurrentProp(this.getPrevNode(), innerPropName);
  }
}
class BinaryParser {
  parse(buffer) {
    const reader = new BinaryReader(buffer);
    reader.skip(23);
    const version = reader.getUint32();
    if (version < 6400) {
      throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: " + version);
    }
    const allNodes = new FBXTree();
    while (!this.endOfContent(reader)) {
      const node = this.parseNode(reader, version);
      if (node !== null) allNodes.add(node.name, node);
    }
    return allNodes;
  }
  // Check if reader has reached the end of content.
  endOfContent(reader) {
    if (reader.size() % 16 === 0) {
      return (reader.getOffset() + 160 + 16 & -16) >= reader.size();
    } else {
      return reader.getOffset() + 160 + 16 >= reader.size();
    }
  }
  // recursively parse nodes until the end of the file is reached
  parseNode(reader, version) {
    const node = {};
    const endOffset = version >= 7500 ? reader.getUint64() : reader.getUint32();
    const numProperties = version >= 7500 ? reader.getUint64() : reader.getUint32();
    version >= 7500 ? reader.getUint64() : reader.getUint32();
    const nameLen = reader.getUint8();
    const name = reader.getString(nameLen);
    if (endOffset === 0) return null;
    const propertyList = [];
    for (let i = 0; i < numProperties; i++) {
      propertyList.push(this.parseProperty(reader));
    }
    const id = propertyList.length > 0 ? propertyList[0] : "";
    const attrName = propertyList.length > 1 ? propertyList[1] : "";
    const attrType = propertyList.length > 2 ? propertyList[2] : "";
    node.singleProperty = numProperties === 1 && reader.getOffset() === endOffset ? true : false;
    while (endOffset > reader.getOffset()) {
      const subNode = this.parseNode(reader, version);
      if (subNode !== null) this.parseSubNode(name, node, subNode);
    }
    node.propertyList = propertyList;
    if (typeof id === "number") node.id = id;
    if (attrName !== "") node.attrName = attrName;
    if (attrType !== "") node.attrType = attrType;
    if (name !== "") node.name = name;
    return node;
  }
  parseSubNode(name, node, subNode) {
    if (subNode.singleProperty === true) {
      const value = subNode.propertyList[0];
      if (Array.isArray(value)) {
        node[subNode.name] = subNode;
        subNode.a = value;
      } else {
        node[subNode.name] = value;
      }
    } else if (name === "Connections" && subNode.name === "C") {
      const array = [];
      subNode.propertyList.forEach(function(property, i) {
        if (i !== 0) array.push(property);
      });
      if (node.connections === void 0) {
        node.connections = [];
      }
      node.connections.push(array);
    } else if (subNode.name === "Properties70") {
      const keys = Object.keys(subNode);
      keys.forEach(function(key) {
        node[key] = subNode[key];
      });
    } else if (name === "Properties70" && subNode.name === "P") {
      let innerPropName = subNode.propertyList[0];
      let innerPropType1 = subNode.propertyList[1];
      const innerPropType2 = subNode.propertyList[2];
      const innerPropFlag = subNode.propertyList[3];
      let innerPropValue;
      if (innerPropName.indexOf("Lcl ") === 0) innerPropName = innerPropName.replace("Lcl ", "Lcl_");
      if (innerPropType1.indexOf("Lcl ") === 0) innerPropType1 = innerPropType1.replace("Lcl ", "Lcl_");
      if (innerPropType1 === "Color" || innerPropType1 === "ColorRGB" || innerPropType1 === "Vector" || innerPropType1 === "Vector3D" || innerPropType1.indexOf("Lcl_") === 0) {
        innerPropValue = [
          subNode.propertyList[4],
          subNode.propertyList[5],
          subNode.propertyList[6]
        ];
      } else {
        innerPropValue = subNode.propertyList[4];
      }
      node[innerPropName] = {
        "type": innerPropType1,
        "type2": innerPropType2,
        "flag": innerPropFlag,
        "value": innerPropValue
      };
    } else if (node[subNode.name] === void 0) {
      if (typeof subNode.id === "number") {
        node[subNode.name] = {};
        node[subNode.name][subNode.id] = subNode;
      } else {
        node[subNode.name] = subNode;
      }
    } else {
      if (subNode.name === "PoseNode") {
        if (!Array.isArray(node[subNode.name])) {
          node[subNode.name] = [node[subNode.name]];
        }
        node[subNode.name].push(subNode);
      } else if (node[subNode.name][subNode.id] === void 0) {
        node[subNode.name][subNode.id] = subNode;
      }
    }
  }
  parseProperty(reader) {
    const type = reader.getString(1);
    let length;
    switch (type) {
      case "C":
        return reader.getBoolean();
      case "D":
        return reader.getFloat64();
      case "F":
        return reader.getFloat32();
      case "I":
        return reader.getInt32();
      case "L":
        return reader.getInt64();
      case "R":
        length = reader.getUint32();
        return reader.getArrayBuffer(length);
      case "S":
        length = reader.getUint32();
        return reader.getString(length);
      case "Y":
        return reader.getInt16();
      case "b":
      case "c":
      case "d":
      case "f":
      case "i":
      case "l":
        const arrayLength = reader.getUint32();
        const encoding = reader.getUint32();
        const compressedLength = reader.getUint32();
        if (encoding === 0) {
          switch (type) {
            case "b":
            case "c":
              return reader.getBooleanArray(arrayLength);
            case "d":
              return reader.getFloat64Array(arrayLength);
            case "f":
              return reader.getFloat32Array(arrayLength);
            case "i":
              return reader.getInt32Array(arrayLength);
            case "l":
              return reader.getInt64Array(arrayLength);
          }
        }
        const data = unzlibSync(new Uint8Array(reader.getArrayBuffer(compressedLength)));
        const reader2 = new BinaryReader(data.buffer);
        switch (type) {
          case "b":
          case "c":
            return reader2.getBooleanArray(arrayLength);
          case "d":
            return reader2.getFloat64Array(arrayLength);
          case "f":
            return reader2.getFloat32Array(arrayLength);
          case "i":
            return reader2.getInt32Array(arrayLength);
          case "l":
            return reader2.getInt64Array(arrayLength);
        }
        break;
      // cannot happen but is required by the DeepScan
      default:
        throw new Error("THREE.FBXLoader: Unknown property type " + type);
    }
  }
}
class BinaryReader {
  constructor(buffer, littleEndian) {
    this.dv = new DataView(buffer);
    this.offset = 0;
    this.littleEndian = littleEndian !== void 0 ? littleEndian : true;
    this._textDecoder = new TextDecoder();
  }
  getOffset() {
    return this.offset;
  }
  size() {
    return this.dv.buffer.byteLength;
  }
  skip(length) {
    this.offset += length;
  }
  // seems like true/false representation depends on exporter.
  // true: 1 or 'Y'(=0x59), false: 0 or 'T'(=0x54)
  // then sees LSB.
  getBoolean() {
    return (this.getUint8() & 1) === 1;
  }
  getBooleanArray(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getBoolean());
    }
    return a;
  }
  getUint8() {
    const value = this.dv.getUint8(this.offset);
    this.offset += 1;
    return value;
  }
  getInt16() {
    const value = this.dv.getInt16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }
  getInt32() {
    const value = this.dv.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  getInt32Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getInt32());
    }
    return a;
  }
  getUint32() {
    const value = this.dv.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  // JavaScript doesn't support 64-bit integer so calculate this here
  // 1 << 32 will return 1 so using multiply operation instead here.
  // There's a possibility that this method returns wrong value if the value
  // is out of the range between Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER.
  // TODO: safely handle 64-bit integer
  getInt64() {
    let low, high;
    if (this.littleEndian) {
      low = this.getUint32();
      high = this.getUint32();
    } else {
      high = this.getUint32();
      low = this.getUint32();
    }
    if (high & 2147483648) {
      high = ~high & 4294967295;
      low = ~low & 4294967295;
      if (low === 4294967295) high = high + 1 & 4294967295;
      low = low + 1 & 4294967295;
      return -(high * 4294967296 + low);
    }
    return high * 4294967296 + low;
  }
  getInt64Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getInt64());
    }
    return a;
  }
  // Note: see getInt64() comment
  getUint64() {
    let low, high;
    if (this.littleEndian) {
      low = this.getUint32();
      high = this.getUint32();
    } else {
      high = this.getUint32();
      low = this.getUint32();
    }
    return high * 4294967296 + low;
  }
  getFloat32() {
    const value = this.dv.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }
  getFloat32Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getFloat32());
    }
    return a;
  }
  getFloat64() {
    const value = this.dv.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }
  getFloat64Array(size) {
    const a = [];
    for (let i = 0; i < size; i++) {
      a.push(this.getFloat64());
    }
    return a;
  }
  getArrayBuffer(size) {
    const value = this.dv.buffer.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }
  getString(size) {
    const start = this.offset;
    let a = new Uint8Array(this.dv.buffer, start, size);
    this.skip(size);
    const nullByte = a.indexOf(0);
    if (nullByte >= 0) a = new Uint8Array(this.dv.buffer, start, nullByte);
    return this._textDecoder.decode(a);
  }
}
class FBXTree {
  add(key, val) {
    this[key] = val;
  }
}
function isFbxFormatBinary(buffer) {
  const CORRECT = "Kaydara FBX Binary  \0";
  return buffer.byteLength >= CORRECT.length && CORRECT === convertArrayBufferToString(buffer, 0, CORRECT.length);
}
function isFbxFormatASCII(text) {
  const CORRECT = ["K", "a", "y", "d", "a", "r", "a", "\\", "F", "B", "X", "\\", "B", "i", "n", "a", "r", "y", "\\", "\\"];
  let cursor = 0;
  function read(offset) {
    const result = text[offset - 1];
    text = text.slice(cursor + offset);
    cursor++;
    return result;
  }
  for (let i = 0; i < CORRECT.length; ++i) {
    const num = read(1);
    if (num === CORRECT[i]) {
      return false;
    }
  }
  return true;
}
function getFbxVersion(text) {
  const versionRegExp = /FBXVersion: (\d+)/;
  const match = text.match(versionRegExp);
  if (match) {
    const version = parseInt(match[1]);
    return version;
  }
  throw new Error("THREE.FBXLoader: Cannot find the version number for the file given.");
}
function convertFBXTimeToSeconds(time) {
  return time / 46186158e3;
}
const dataArray = [];
function getData(polygonVertexIndex, polygonIndex, vertexIndex, infoObject) {
  let index;
  switch (infoObject.mappingType) {
    case "ByPolygonVertex":
      index = polygonVertexIndex;
      break;
    case "ByPolygon":
      index = polygonIndex;
      break;
    case "ByVertice":
      index = vertexIndex;
      break;
    case "AllSame":
      index = infoObject.indices[0];
      break;
    default:
      console.warn("THREE.FBXLoader: unknown attribute mapping type " + infoObject.mappingType);
  }
  if (infoObject.referenceType === "IndexToDirect") index = infoObject.indices[index];
  const from = index * infoObject.dataSize;
  const to = from + infoObject.dataSize;
  return slice(dataArray, infoObject.buffer, from, to);
}
const tempEuler = new Euler();
const tempVec = new Vector3();
function generateTransform(transformData) {
  const lTranslationM = new Matrix4();
  const lPreRotationM = new Matrix4();
  const lRotationM = new Matrix4();
  const lPostRotationM = new Matrix4();
  const lScalingM = new Matrix4();
  const lScalingPivotM = new Matrix4();
  const lScalingOffsetM = new Matrix4();
  const lRotationOffsetM = new Matrix4();
  const lRotationPivotM = new Matrix4();
  const lParentGX = new Matrix4();
  const lParentLX = new Matrix4();
  const lGlobalT = new Matrix4();
  const inheritType = transformData.inheritType ? transformData.inheritType : 0;
  if (transformData.translation) lTranslationM.setPosition(tempVec.fromArray(transformData.translation));
  const defaultEulerOrder = getEulerOrder(0);
  if (transformData.preRotation) {
    const array = transformData.preRotation.map(MathUtils.degToRad);
    array.push(defaultEulerOrder);
    lPreRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
  }
  if (transformData.rotation) {
    const array = transformData.rotation.map(MathUtils.degToRad);
    array.push(transformData.eulerOrder || defaultEulerOrder);
    lRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
  }
  if (transformData.postRotation) {
    const array = transformData.postRotation.map(MathUtils.degToRad);
    array.push(defaultEulerOrder);
    lPostRotationM.makeRotationFromEuler(tempEuler.fromArray(array));
    lPostRotationM.invert();
  }
  if (transformData.scale) lScalingM.scale(tempVec.fromArray(transformData.scale));
  if (transformData.scalingOffset) lScalingOffsetM.setPosition(tempVec.fromArray(transformData.scalingOffset));
  if (transformData.scalingPivot) lScalingPivotM.setPosition(tempVec.fromArray(transformData.scalingPivot));
  if (transformData.rotationOffset) lRotationOffsetM.setPosition(tempVec.fromArray(transformData.rotationOffset));
  if (transformData.rotationPivot) lRotationPivotM.setPosition(tempVec.fromArray(transformData.rotationPivot));
  if (transformData.parentMatrixWorld) {
    lParentLX.copy(transformData.parentMatrix);
    lParentGX.copy(transformData.parentMatrixWorld);
  }
  const lLRM = lPreRotationM.clone().multiply(lRotationM).multiply(lPostRotationM);
  const lParentGRM = new Matrix4();
  lParentGRM.extractRotation(lParentGX);
  const lParentTM = new Matrix4();
  lParentTM.copyPosition(lParentGX);
  const lParentGRSM = lParentTM.clone().invert().multiply(lParentGX);
  const lParentGSM = lParentGRM.clone().invert().multiply(lParentGRSM);
  const lLSM = lScalingM;
  const lGlobalRS = new Matrix4();
  if (inheritType === 0) {
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM).multiply(lLSM);
  } else if (inheritType === 1) {
    lGlobalRS.copy(lParentGRM).multiply(lParentGSM).multiply(lLRM).multiply(lLSM);
  } else {
    const lParentLSM = new Matrix4().scale(new Vector3().setFromMatrixScale(lParentLX));
    const lParentLSM_inv = lParentLSM.clone().invert();
    const lParentGSM_noLocal = lParentGSM.clone().multiply(lParentLSM_inv);
    lGlobalRS.copy(lParentGRM).multiply(lLRM).multiply(lParentGSM_noLocal).multiply(lLSM);
  }
  const lRotationPivotM_inv = lRotationPivotM.clone().invert();
  const lScalingPivotM_inv = lScalingPivotM.clone().invert();
  let lTransform = lTranslationM.clone().multiply(lRotationOffsetM).multiply(lRotationPivotM).multiply(lPreRotationM).multiply(lRotationM).multiply(lPostRotationM).multiply(lRotationPivotM_inv).multiply(lScalingOffsetM).multiply(lScalingPivotM).multiply(lScalingM).multiply(lScalingPivotM_inv);
  const lLocalTWithAllPivotAndOffsetInfo = new Matrix4().copyPosition(lTransform);
  const lGlobalTranslation = lParentGX.clone().multiply(lLocalTWithAllPivotAndOffsetInfo);
  lGlobalT.copyPosition(lGlobalTranslation);
  lTransform = lGlobalT.clone().multiply(lGlobalRS);
  lTransform.premultiply(lParentGX.invert());
  return lTransform;
}
function getEulerOrder(order) {
  order = order || 0;
  const enums = [
    "ZYX",
    // -> XYZ extrinsic
    "YZX",
    // -> XZY extrinsic
    "XZY",
    // -> YZX extrinsic
    "ZXY",
    // -> YXZ extrinsic
    "YXZ",
    // -> ZXY extrinsic
    "XYZ"
    // -> ZYX extrinsic
    //'SphericXYZ', // not possible to support
  ];
  if (order === 6) {
    console.warn("THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect.");
    return enums[0];
  }
  return enums[order];
}
function parseNumberArray(value) {
  const array = value.split(",").map(function(val) {
    return parseFloat(val);
  });
  return array;
}
function convertArrayBufferToString(buffer, from, to) {
  if (from === void 0) from = 0;
  if (to === void 0) to = buffer.byteLength;
  return new TextDecoder().decode(new Uint8Array(buffer, from, to));
}
function append(a, b) {
  for (let i = 0, j = a.length, l = b.length; i < l; i++, j++) {
    a[j] = b[i];
  }
}
function slice(a, b, from, to) {
  for (let i = from, j = 0; i < to; i++, j++) {
    a[j] = b[i];
  }
  return a;
}

// o object_name | g group_name
const _object_pattern = /^[og]\s*(.+)?/;
// mtllib file_reference
const _material_library_pattern = /^mtllib /;
// usemtl material_name
const _material_use_pattern = /^usemtl /;
// usemap map_name
const _map_use_pattern = /^usemap /;
const _face_vertex_data_separator_pattern = /\s+/;

const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();

const _ab = new Vector3();
const _cb = new Vector3();

const _color$1 = new Color();

function ParserState() {

	const state = {
		objects: [],
		object: {},

		vertices: [],
		normals: [],
		colors: [],
		uvs: [],

		materials: {},
		materialLibraries: [],

		startObject: function ( name, fromDeclaration ) {

			// If the current object (initial from reset) is not from a g/o declaration in the parsed
			// file. We need to use it for the first parsed g/o to keep things in sync.
			if ( this.object && this.object.fromDeclaration === false ) {

				this.object.name = name;
				this.object.fromDeclaration = ( fromDeclaration !== false );
				return;

			}

			const previousMaterial = ( this.object && typeof this.object.currentMaterial === 'function' ? this.object.currentMaterial() : undefined );

			if ( this.object && typeof this.object._finalize === 'function' ) {

				this.object._finalize( true );

			}

			this.object = {
				name: name || '',
				fromDeclaration: ( fromDeclaration !== false ),

				geometry: {
					vertices: [],
					normals: [],
					colors: [],
					uvs: [],
					hasUVIndices: false
				},
				materials: [],
				smooth: true,

				startMaterial: function ( name, libraries ) {

					const previous = this._finalize( false );

					// New usemtl declaration overwrites an inherited material, except if faces were declared
					// after the material, then it must be preserved for proper MultiMaterial continuation.
					if ( previous && ( previous.inherited || previous.groupCount <= 0 ) ) {

						this.materials.splice( previous.index, 1 );

					}

					const material = {
						index: this.materials.length,
						name: name || '',
						mtllib: ( Array.isArray( libraries ) && libraries.length > 0 ? libraries[ libraries.length - 1 ] : '' ),
						smooth: ( previous !== undefined ? previous.smooth : this.smooth ),
						groupStart: ( previous !== undefined ? previous.groupEnd : 0 ),
						groupEnd: -1,
						groupCount: -1,
						inherited: false,

						clone: function ( index ) {

							const cloned = {
								index: ( typeof index === 'number' ? index : this.index ),
								name: this.name,
								mtllib: this.mtllib,
								smooth: this.smooth,
								groupStart: 0,
								groupEnd: -1,
								groupCount: -1,
								inherited: false
							};
							cloned.clone = this.clone.bind( cloned );
							return cloned;

						}
					};

					this.materials.push( material );

					return material;

				},

				currentMaterial: function () {

					if ( this.materials.length > 0 ) {

						return this.materials[ this.materials.length - 1 ];

					}

					return undefined;

				},

				_finalize: function ( end ) {

					const lastMultiMaterial = this.currentMaterial();
					if ( lastMultiMaterial && lastMultiMaterial.groupEnd === -1 ) {

						lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
						lastMultiMaterial.groupCount = lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
						lastMultiMaterial.inherited = false;

					}

					// Ignore objects tail materials if no face declarations followed them before a new o/g started.
					if ( end && this.materials.length > 1 ) {

						for ( let mi = this.materials.length - 1; mi >= 0; mi -- ) {

							if ( this.materials[ mi ].groupCount <= 0 ) {

								this.materials.splice( mi, 1 );

							}

						}

					}

					// Guarantee at least one empty material, this makes the creation later more straight forward.
					if ( end && this.materials.length === 0 ) {

						this.materials.push( {
							name: '',
							smooth: this.smooth
						} );

					}

					return lastMultiMaterial;

				}
			};

			// Inherit previous objects material.
			// Spec tells us that a declared material must be set to all objects until a new material is declared.
			// If a usemtl declaration is encountered while this new object is being parsed, it will
			// overwrite the inherited material. Exception being that there was already face declarations
			// to the inherited material, then it will be preserved for proper MultiMaterial continuation.

			if ( previousMaterial && previousMaterial.name && typeof previousMaterial.clone === 'function' ) {

				const declared = previousMaterial.clone( 0 );
				declared.inherited = true;
				this.object.materials.push( declared );

			}

			this.objects.push( this.object );

		},

		finalize: function () {

			if ( this.object && typeof this.object._finalize === 'function' ) {

				this.object._finalize( true );

			}

		},

		parseVertexIndex: function ( value, len ) {

			const index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

		},

		parseNormalIndex: function ( value, len ) {

			const index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 3 ) * 3;

		},

		parseUVIndex: function ( value, len ) {

			const index = parseInt( value, 10 );
			return ( index >= 0 ? index - 1 : index + len / 2 ) * 2;

		},

		addVertex: function ( a, b, c ) {

			const src = this.vertices;
			const dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addVertexPoint: function ( a ) {

			const src = this.vertices;
			const dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

		},

		addVertexLine: function ( a ) {

			const src = this.vertices;
			const dst = this.object.geometry.vertices;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );

		},

		addNormal: function ( a, b, c ) {

			const src = this.normals;
			const dst = this.object.geometry.normals;

			dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addFaceNormal: function ( a, b, c ) {

			const src = this.vertices;
			const dst = this.object.geometry.normals;

			_vA.fromArray( src, a );
			_vB.fromArray( src, b );
			_vC.fromArray( src, c );

			_cb.subVectors( _vC, _vB );
			_ab.subVectors( _vA, _vB );
			_cb.cross( _ab );

			_cb.normalize();

			dst.push( _cb.x, _cb.y, _cb.z );
			dst.push( _cb.x, _cb.y, _cb.z );
			dst.push( _cb.x, _cb.y, _cb.z );

		},

		addColor: function ( a, b, c ) {

			const src = this.colors;
			const dst = this.object.geometry.colors;

			if ( src[ a ] !== undefined ) dst.push( src[ a + 0 ], src[ a + 1 ], src[ a + 2 ] );
			if ( src[ b ] !== undefined ) dst.push( src[ b + 0 ], src[ b + 1 ], src[ b + 2 ] );
			if ( src[ c ] !== undefined ) dst.push( src[ c + 0 ], src[ c + 1 ], src[ c + 2 ] );

		},

		addUV: function ( a, b, c ) {

			const src = this.uvs;
			const dst = this.object.geometry.uvs;

			dst.push( src[ a + 0 ], src[ a + 1 ] );
			dst.push( src[ b + 0 ], src[ b + 1 ] );
			dst.push( src[ c + 0 ], src[ c + 1 ] );

		},

		addDefaultUV: function () {

			const dst = this.object.geometry.uvs;

			dst.push( 0, 0 );
			dst.push( 0, 0 );
			dst.push( 0, 0 );

		},

		addUVLine: function ( a ) {

			const src = this.uvs;
			const dst = this.object.geometry.uvs;

			dst.push( src[ a + 0 ], src[ a + 1 ] );

		},

		addFace: function ( a, b, c, ua, ub, uc, na, nb, nc ) {

			const vLen = this.vertices.length;

			let ia = this.parseVertexIndex( a, vLen );
			let ib = this.parseVertexIndex( b, vLen );
			let ic = this.parseVertexIndex( c, vLen );

			this.addVertex( ia, ib, ic );
			this.addColor( ia, ib, ic );

			// normals

			if ( na !== undefined && na !== '' ) {

				const nLen = this.normals.length;

				ia = this.parseNormalIndex( na, nLen );
				ib = this.parseNormalIndex( nb, nLen );
				ic = this.parseNormalIndex( nc, nLen );

				this.addNormal( ia, ib, ic );

			} else {

				this.addFaceNormal( ia, ib, ic );

			}

			// uvs

			if ( ua !== undefined && ua !== '' ) {

				const uvLen = this.uvs.length;

				ia = this.parseUVIndex( ua, uvLen );
				ib = this.parseUVIndex( ub, uvLen );
				ic = this.parseUVIndex( uc, uvLen );

				this.addUV( ia, ib, ic );

				this.object.geometry.hasUVIndices = true;

			} else {

				// add placeholder values (for inconsistent face definitions)

				this.addDefaultUV();

			}

		},

		addPointGeometry: function ( vertices ) {

			this.object.geometry.type = 'Points';

			const vLen = this.vertices.length;

			for ( let vi = 0, l = vertices.length; vi < l; vi ++ ) {

				const index = this.parseVertexIndex( vertices[ vi ], vLen );

				this.addVertexPoint( index );
				this.addColor( index );

			}

		},

		addLineGeometry: function ( vertices, uvs ) {

			this.object.geometry.type = 'Line';

			const vLen = this.vertices.length;
			const uvLen = this.uvs.length;

			for ( let vi = 0, l = vertices.length; vi < l; vi ++ ) {

				this.addVertexLine( this.parseVertexIndex( vertices[ vi ], vLen ) );

			}

			for ( let uvi = 0, l = uvs.length; uvi < l; uvi ++ ) {

				this.addUVLine( this.parseUVIndex( uvs[ uvi ], uvLen ) );

			}

		}

	};

	state.startObject( '', false );

	return state;

}


/**
 * A loader for the OBJ format.
 *
 * The [OBJ format](https://en.wikipedia.org/wiki/Wavefront_.obj_file) is a simple data-format that
 * represents 3D geometry in a human readable format as the position of each vertex, the UV position of
 * each texture coordinate vertex, vertex normals, and the faces that make each polygon defined as a list
 * of vertices, and texture vertices.
 *
 * ```js
 * const loader = new OBJLoader();
 * const object = await loader.loadAsync( 'models/monster.obj' );
 * scene.add( object );
 * ```
 *
 * @augments Loader
 * @three_import import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
 */
class OBJLoader extends Loader {

	/**
	 * Constructs a new OBJ loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		/**
		 * A reference to a material creator.
		 *
		 * @type {?MaterialCreator}
		 * @default null
		 */
		this.materials = null;

	}

	/**
	 * Starts loading from the given URL and passes the loaded OBJ asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(Group)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		const loader = new FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( url, function ( text ) {

			try {

				onLoad( scope.parse( text ) );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	/**
	 * Sets the material creator for this OBJ. This object is loaded via {@link MTLLoader}.
	 *
	 * @param {MaterialCreator} materials - An object that creates the materials for this OBJ.
	 * @return {OBJLoader} A reference to this loader.
	 */
	setMaterials( materials ) {

		this.materials = materials;

		return this;

	}

	/**
	 * Parses the given OBJ data and returns the resulting group.
	 *
	 * @param {string} text - The raw OBJ data as a string.
	 * @return {Group} The parsed OBJ.
	 */
	parse( text ) {

		const state = new ParserState();

		if ( text.indexOf( '\r\n' ) !== -1 ) {

			// This is faster than String.split with regex that splits on both
			text = text.replace( /\r\n/g, '\n' );

		}

		if ( text.indexOf( '\\\n' ) !== -1 ) {

			// join lines separated by a line continuation character (\)
			text = text.replace( /\\\n/g, '' );

		}

		const lines = text.split( '\n' );
		let result = [];

		for ( let i = 0, l = lines.length; i < l; i ++ ) {

			const line = lines[ i ].trimStart();

			if ( line.length === 0 ) continue;

			const lineFirstChar = line.charAt( 0 );

			// @todo invoke passed in handler if any
			if ( lineFirstChar === '#' ) continue; // skip comments

			if ( lineFirstChar === 'v' ) {

				const data = line.split( _face_vertex_data_separator_pattern );

				switch ( data[ 0 ] ) {

					case 'v':
						state.vertices.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] ),
							parseFloat( data[ 3 ] )
						);
						if ( data.length >= 7 ) {

							_color$1.setRGB(
								parseFloat( data[ 4 ] ),
								parseFloat( data[ 5 ] ),
								parseFloat( data[ 6 ] ),
								SRGBColorSpace
							);

							state.colors.push( _color$1.r, _color$1.g, _color$1.b );

						} else {

							// if no colors are defined, add placeholders so color and vertex indices match

							state.colors.push( undefined, undefined, undefined );

						}

						break;
					case 'vn':
						state.normals.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] ),
							parseFloat( data[ 3 ] )
						);
						break;
					case 'vt':
						state.uvs.push(
							parseFloat( data[ 1 ] ),
							parseFloat( data[ 2 ] )
						);
						break;

				}

			} else if ( lineFirstChar === 'f' ) {

				const lineData = line.slice( 1 ).trim();
				const vertexData = lineData.split( _face_vertex_data_separator_pattern );
				const faceVertices = [];

				// Parse the face vertex data into an easy to work with format

				for ( let j = 0, jl = vertexData.length; j < jl; j ++ ) {

					const vertex = vertexData[ j ];

					if ( vertex.length > 0 ) {

						const vertexParts = vertex.split( '/' );
						faceVertices.push( vertexParts );

					}

				}

				// Draw an edge between the first vertex and all subsequent vertices to form an n-gon

				const v1 = faceVertices[ 0 ];

				for ( let j = 1, jl = faceVertices.length - 1; j < jl; j ++ ) {

					const v2 = faceVertices[ j ];
					const v3 = faceVertices[ j + 1 ];

					state.addFace(
						v1[ 0 ], v2[ 0 ], v3[ 0 ],
						v1[ 1 ], v2[ 1 ], v3[ 1 ],
						v1[ 2 ], v2[ 2 ], v3[ 2 ]
					);

				}

			} else if ( lineFirstChar === 'l' ) {

				const lineParts = line.substring( 1 ).trim().split( ' ' );
				let lineVertices = [];
				const lineUVs = [];

				if ( line.indexOf( '/' ) === -1 ) {

					lineVertices = lineParts;

				} else {

					for ( let li = 0, llen = lineParts.length; li < llen; li ++ ) {

						const parts = lineParts[ li ].split( '/' );

						if ( parts[ 0 ] !== '' ) lineVertices.push( parts[ 0 ] );
						if ( parts[ 1 ] !== '' ) lineUVs.push( parts[ 1 ] );

					}

				}

				state.addLineGeometry( lineVertices, lineUVs );

			} else if ( lineFirstChar === 'p' ) {

				const lineData = line.slice( 1 ).trim();
				const pointData = lineData.split( ' ' );

				state.addPointGeometry( pointData );

			} else if ( ( result = _object_pattern.exec( line ) ) !== null ) {

				// o object_name
				// or
				// g group_name

				// WORKAROUND: https://bugs.chromium.org/p/v8/issues/detail?id=2869
				// let name = result[ 0 ].slice( 1 ).trim();
				const name = ( ' ' + result[ 0 ].slice( 1 ).trim() ).slice( 1 );

				state.startObject( name );

			} else if ( _material_use_pattern.test( line ) ) {

				// material

				state.object.startMaterial( line.substring( 7 ).trim(), state.materialLibraries );

			} else if ( _material_library_pattern.test( line ) ) {

				// mtl file

				state.materialLibraries.push( line.substring( 7 ).trim() );

			} else if ( _map_use_pattern.test( line ) ) {

				// the line is parsed but ignored since the loader assumes textures are defined MTL files
				// (according to https://www.okino.com/conv/imp_wave.htm, 'usemap' is the old-style Wavefront texture reference method)

				console.warn( 'THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.' );

			} else if ( lineFirstChar === 's' ) {

				result = line.split( ' ' );

				// smooth shading

				// @todo Handle files that have varying smooth values for a set of faces inside one geometry,
				// but does not define a usemtl for each face set.
				// This should be detected and a dummy material created (later MultiMaterial and geometry groups).
				// This requires some care to not create extra material on each smooth value for "normal" obj files.
				// where explicit usemtl defines geometry groups.
				// Example asset: examples/models/obj/cerberus/Cerberus.obj

				/*
					 * http://paulbourke.net/dataformats/obj/
					 *
					 * From chapter "Grouping" Syntax explanation "s group_number":
					 * "group_number is the smoothing group number. To turn off smoothing groups, use a value of 0 or off.
					 * Polygonal elements use group numbers to put elements in different smoothing groups. For free-form
					 * surfaces, smoothing groups are either turned on or off; there is no difference between values greater
					 * than 0."
					 */
				if ( result.length > 1 ) {

					const value = result[ 1 ].trim().toLowerCase();
					state.object.smooth = ( value !== '0' && value !== 'off' );

				} else {

					// ZBrush can produce "s" lines #11707
					state.object.smooth = true;

				}

				const material = state.object.currentMaterial();
				if ( material ) material.smooth = state.object.smooth;

			} else {

				// Handle null terminated files without exception
				if ( line === '\0' ) continue;

				console.warn( 'THREE.OBJLoader: Unexpected line: "' + line + '"' );

			}

		}

		state.finalize();

		const container = new Group();
		container.materialLibraries = [].concat( state.materialLibraries );

		const hasPrimitives = ! ( state.objects.length === 1 && state.objects[ 0 ].geometry.vertices.length === 0 );

		if ( hasPrimitives === true ) {

			for ( let i = 0, l = state.objects.length; i < l; i ++ ) {

				const object = state.objects[ i ];
				const geometry = object.geometry;
				const materials = object.materials;
				const isLine = ( geometry.type === 'Line' );
				const isPoints = ( geometry.type === 'Points' );
				let hasVertexColors = false;

				// Skip o/g line declarations that did not follow with any faces
				if ( geometry.vertices.length === 0 ) continue;

				const buffergeometry = new BufferGeometry();

				buffergeometry.setAttribute( 'position', new Float32BufferAttribute( geometry.vertices, 3 ) );

				if ( geometry.normals.length > 0 ) {

					buffergeometry.setAttribute( 'normal', new Float32BufferAttribute( geometry.normals, 3 ) );

				}

				if ( geometry.colors.length > 0 ) {

					hasVertexColors = true;
					buffergeometry.setAttribute( 'color', new Float32BufferAttribute( geometry.colors, 3 ) );

				}

				if ( geometry.hasUVIndices === true ) {

					buffergeometry.setAttribute( 'uv', new Float32BufferAttribute( geometry.uvs, 2 ) );

				}

				// Create materials

				const createdMaterials = [];

				for ( let mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

					const sourceMaterial = materials[ mi ];
					const materialHash = sourceMaterial.name + '_' + sourceMaterial.smooth + '_' + hasVertexColors;
					let material = state.materials[ materialHash ];

					if ( this.materials !== null ) {

						material = this.materials.create( sourceMaterial.name );

						// mtl etc. loaders probably can't create line materials correctly, copy properties to a line material.
						if ( isLine && material && ! ( material instanceof LineBasicMaterial ) ) {

							const materialLine = new LineBasicMaterial();
							Material.prototype.copy.call( materialLine, material );
							materialLine.color.copy( material.color );
							material = materialLine;

						} else if ( isPoints && material && ! ( material instanceof PointsMaterial ) ) {

							const materialPoints = new PointsMaterial( { size: 10, sizeAttenuation: false } );
							Material.prototype.copy.call( materialPoints, material );
							materialPoints.color.copy( material.color );
							materialPoints.map = material.map;
							material = materialPoints;

						}

					}

					if ( material === undefined ) {

						if ( isLine ) {

							material = new LineBasicMaterial();

						} else if ( isPoints ) {

							material = new PointsMaterial( { size: 1, sizeAttenuation: false } );

						} else {

							material = new MeshPhongMaterial();

						}

						material.name = sourceMaterial.name;
						material.flatShading = sourceMaterial.smooth ? false : true;
						material.vertexColors = hasVertexColors;

						state.materials[ materialHash ] = material;

					}

					createdMaterials.push( material );

				}

				// Create mesh

				let mesh;

				if ( createdMaterials.length > 1 ) {

					for ( let mi = 0, miLen = materials.length; mi < miLen; mi ++ ) {

						const sourceMaterial = materials[ mi ];
						buffergeometry.addGroup( sourceMaterial.groupStart, sourceMaterial.groupCount, mi );

					}

					if ( isLine ) {

						mesh = new LineSegments( buffergeometry, createdMaterials );

					} else if ( isPoints ) {

						mesh = new Points( buffergeometry, createdMaterials );

					} else {

						mesh = new Mesh( buffergeometry, createdMaterials );

					}

				} else {

					if ( isLine ) {

						mesh = new LineSegments( buffergeometry, createdMaterials[ 0 ] );

					} else if ( isPoints ) {

						mesh = new Points( buffergeometry, createdMaterials[ 0 ] );

					} else {

						mesh = new Mesh( buffergeometry, createdMaterials[ 0 ] );

					}

				}

				mesh.name = object.name;

				container.add( mesh );

			}

		} else {

			// if there is only the default parser state object with no geometry data, interpret data as point cloud

			if ( state.vertices.length > 0 ) {

				const material = new PointsMaterial( { size: 1, sizeAttenuation: false } );

				const buffergeometry = new BufferGeometry();

				buffergeometry.setAttribute( 'position', new Float32BufferAttribute( state.vertices, 3 ) );

				if ( state.colors.length > 0 && state.colors[ 0 ] !== undefined ) {

					buffergeometry.setAttribute( 'color', new Float32BufferAttribute( state.colors, 3 ) );
					material.vertexColors = true;

				}

				const points = new Points( buffergeometry, material );
				container.add( points );

			}

		}

		return container;

	}

}

/**
 * A loader for the STL format, as created by Solidworks and other CAD programs.
 *
 * Supports both binary and ASCII encoded files. The loader returns a non-indexed buffer geometry.
 *
 * Limitations:
 * - Binary decoding supports "Magics" color format (http://en.wikipedia.org/wiki/STL_(file_format)#Color_in_binary_STL).
 * - There is perhaps some question as to how valid it is to always assume little-endian-ness.
 * - ASCII decoding assumes file is UTF-8.
 *
 * ```js
 * const loader = new STLLoader();
 * const geometry = await loader.loadAsync( './models/stl/slotted_disk.stl' )
 * scene.add( new THREE.Mesh( geometry ) );
 * ```
 * For binary STLs geometry might contain colors for vertices. To use it:
 * ```js
 * // use the same code to load STL as above
 * if ( geometry.hasColors ) {
 * 	material = new THREE.MeshPhongMaterial( { opacity: geometry.alpha, vertexColors: true } );
 * }
 * const mesh = new THREE.Mesh( geometry, material );
 * ```
 * For ASCII STLs containing multiple solids, each solid is assigned to a different group.
 * Groups can be used to assign a different color by defining an array of materials with the same length of
 * geometry.groups and passing it to the Mesh constructor:
 *
 * ```js
 * const materials = [];
 * const nGeometryGroups = geometry.groups.length;
 *
 * for ( let i = 0; i < nGeometryGroups; i ++ ) {
 * 	const material = new THREE.MeshPhongMaterial( { color: colorMap[ i ], wireframe: false } );
 * 	materials.push( material );
 * }
 *
 * const mesh = new THREE.Mesh(geometry, materials);
 * ```
 *
 * @augments Loader
 * @three_import import { STLLoader } from 'three/addons/loaders/STLLoader.js';
 */
class STLLoader extends Loader {

	/**
	 * Constructs a new STL loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

	}

	/**
	 * Starts loading from the given URL and passes the loaded STL asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(BufferGeometry)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		const loader = new FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );

		loader.load( url, function ( text ) {

			try {

				onLoad( scope.parse( text ) );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	/**
	 * Parses the given STL data and returns the resulting geometry.
	 *
	 * @param {ArrayBuffer} data - The raw STL data as an array buffer.
	 * @return {BufferGeometry} The parsed geometry.
	 */
	parse( data ) {

		function isBinary( data ) {

			const reader = new DataView( data );
			const face_size = ( 32 / 8 * 3 ) + ( ( 32 / 8 * 3 ) * 3 ) + ( 16 / 8 );
			const n_faces = reader.getUint32( 80, true );
			const expect = 80 + ( 32 / 8 ) + ( n_faces * face_size );

			if ( expect === reader.byteLength ) {

				return true;

			}

			// An ASCII STL data must begin with 'solid ' as the first six bytes.
			// However, ASCII STLs lacking the SPACE after the 'd' are known to be
			// plentiful.  So, check the first 5 bytes for 'solid'.

			// Several encodings, such as UTF-8, precede the text with up to 5 bytes:
			// https://en.wikipedia.org/wiki/Byte_order_mark#Byte_order_marks_by_encoding
			// Search for "solid" to start anywhere after those prefixes.

			// US-ASCII ordinal values for 's', 'o', 'l', 'i', 'd'

			const solid = [ 115, 111, 108, 105, 100 ];

			for ( let off = 0; off < 5; off ++ ) {

				// If "solid" text is matched to the current offset, declare it to be an ASCII STL.

				if ( matchDataViewAt( solid, reader, off ) ) return false;

			}

			// Couldn't find "solid" text at the beginning; it is binary STL.

			return true;

		}

		function matchDataViewAt( query, reader, offset ) {

			// Check if each byte in query matches the corresponding byte from the current offset

			for ( let i = 0, il = query.length; i < il; i ++ ) {

				if ( query[ i ] !== reader.getUint8( offset + i ) ) return false;

			}

			return true;

		}

		function parseBinary( data ) {

			const reader = new DataView( data );
			const faces = reader.getUint32( 80, true );

			let r, g, b, hasColors = false, colors;
			let defaultR, defaultG, defaultB, alpha;

			// process STL header
			// check for default color in header ("COLOR=rgba" sequence).

			for ( let index = 0; index < 80 - 10; index ++ ) {

				if ( ( reader.getUint32( index, false ) == 0x434F4C4F /*COLO*/ ) &&
					( reader.getUint8( index + 4 ) == 0x52 /*'R'*/ ) &&
					( reader.getUint8( index + 5 ) == 0x3D /*'='*/ ) ) {

					hasColors = true;
					colors = new Float32Array( faces * 3 * 3 );

					defaultR = reader.getUint8( index + 6 ) / 255;
					defaultG = reader.getUint8( index + 7 ) / 255;
					defaultB = reader.getUint8( index + 8 ) / 255;
					alpha = reader.getUint8( index + 9 ) / 255;

				}

			}

			const dataOffset = 84;
			const faceLength = 12 * 4 + 2;

			const geometry = new BufferGeometry();

			const vertices = new Float32Array( faces * 3 * 3 );
			const normals = new Float32Array( faces * 3 * 3 );

			const color = new Color();

			for ( let face = 0; face < faces; face ++ ) {

				const start = dataOffset + face * faceLength;
				const normalX = reader.getFloat32( start, true );
				const normalY = reader.getFloat32( start + 4, true );
				const normalZ = reader.getFloat32( start + 8, true );

				if ( hasColors ) {

					const packedColor = reader.getUint16( start + 48, true );

					if ( ( packedColor & 0x8000 ) === 0 ) {

						// facet has its own unique color

						r = ( packedColor & 0x1F ) / 31;
						g = ( ( packedColor >> 5 ) & 0x1F ) / 31;
						b = ( ( packedColor >> 10 ) & 0x1F ) / 31;

					} else {

						r = defaultR;
						g = defaultG;
						b = defaultB;

					}

				}

				for ( let i = 1; i <= 3; i ++ ) {

					const vertexstart = start + i * 12;
					const componentIdx = ( face * 3 * 3 ) + ( ( i - 1 ) * 3 );

					vertices[ componentIdx ] = reader.getFloat32( vertexstart, true );
					vertices[ componentIdx + 1 ] = reader.getFloat32( vertexstart + 4, true );
					vertices[ componentIdx + 2 ] = reader.getFloat32( vertexstart + 8, true );

					normals[ componentIdx ] = normalX;
					normals[ componentIdx + 1 ] = normalY;
					normals[ componentIdx + 2 ] = normalZ;

					if ( hasColors ) {

						color.setRGB( r, g, b, SRGBColorSpace );

						colors[ componentIdx ] = color.r;
						colors[ componentIdx + 1 ] = color.g;
						colors[ componentIdx + 2 ] = color.b;

					}

				}

			}

			geometry.setAttribute( 'position', new BufferAttribute( vertices, 3 ) );
			geometry.setAttribute( 'normal', new BufferAttribute( normals, 3 ) );

			if ( hasColors ) {

				geometry.setAttribute( 'color', new BufferAttribute( colors, 3 ) );
				geometry.hasColors = true;
				geometry.alpha = alpha;

			}

			return geometry;

		}

		function parseASCII( data ) {

			const geometry = new BufferGeometry();
			const patternSolid = /solid([\s\S]*?)endsolid/g;
			const patternFace = /facet([\s\S]*?)endfacet/g;
			const patternName = /solid\s(.+)/;
			let faceCounter = 0;

			const patternFloat = /[\s]+([+-]?(?:\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?)/.source;
			const patternVertex = new RegExp( 'vertex' + patternFloat + patternFloat + patternFloat, 'g' );
			const patternNormal = new RegExp( 'normal' + patternFloat + patternFloat + patternFloat, 'g' );

			const vertices = [];
			const normals = [];
			const groupNames = [];

			const normal = new Vector3();

			let result;

			let groupCount = 0;
			let startVertex = 0;
			let endVertex = 0;

			while ( ( result = patternSolid.exec( data ) ) !== null ) {

				startVertex = endVertex;

				const solid = result[ 0 ];

				const name = ( result = patternName.exec( solid ) ) !== null ? result[ 1 ] : '';
				groupNames.push( name );

				while ( ( result = patternFace.exec( solid ) ) !== null ) {

					let vertexCountPerFace = 0;
					let normalCountPerFace = 0;

					const text = result[ 0 ];

					while ( ( result = patternNormal.exec( text ) ) !== null ) {

						normal.x = parseFloat( result[ 1 ] );
						normal.y = parseFloat( result[ 2 ] );
						normal.z = parseFloat( result[ 3 ] );
						normalCountPerFace ++;

					}

					while ( ( result = patternVertex.exec( text ) ) !== null ) {

						vertices.push( parseFloat( result[ 1 ] ), parseFloat( result[ 2 ] ), parseFloat( result[ 3 ] ) );
						normals.push( normal.x, normal.y, normal.z );
						vertexCountPerFace ++;
						endVertex ++;

					}

					// every face have to own ONE valid normal

					if ( normalCountPerFace !== 1 ) {

						console.error( 'THREE.STLLoader: Something isn\'t right with the normal of face number ' + faceCounter );

					}

					// each face have to own THREE valid vertices

					if ( vertexCountPerFace !== 3 ) {

						console.error( 'THREE.STLLoader: Something isn\'t right with the vertices of face number ' + faceCounter );

					}

					faceCounter ++;

				}

				const start = startVertex;
				const count = endVertex - startVertex;

				geometry.userData.groupNames = groupNames;

				geometry.addGroup( start, count, groupCount );
				groupCount ++;

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
			geometry.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );

			return geometry;

		}

		function ensureString( buffer ) {

			if ( typeof buffer !== 'string' ) {

				return new TextDecoder().decode( buffer );

			}

			return buffer;

		}

		function ensureBinary( buffer ) {

			if ( typeof buffer === 'string' ) {

				const array_buffer = new Uint8Array( buffer.length );
				for ( let i = 0; i < buffer.length; i ++ ) {

					array_buffer[ i ] = buffer.charCodeAt( i ) & 0xff; // implicitly assumes little-endian

				}

				return array_buffer.buffer || array_buffer;

			} else {

				return buffer;

			}

		}

		// start

		const binData = ensureBinary( data );

		return isBinary( binData ) ? parseBinary( binData ) : parseASCII( ensureString( data ) );

	}

}

const _color = new Color();

/**
 * A loader for PLY the PLY format (known as the Polygon
 * File Format or the Stanford Triangle Format).
 *
 * Limitations:
 *  - ASCII decoding assumes file is UTF-8.
 *
 * ```js
 * const loader = new PLYLoader();
 * const geometry = await loader.loadAsync( './models/ply/ascii/dolphins.ply' );
 * scene.add( new THREE.Mesh( geometry ) );
 * ```
 *
 * @augments Loader
 * @three_import import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
 */
class PLYLoader extends Loader {

	/**
	 * Constructs a new PLY loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		// internals

		this.propertyNameMapping = {};
		this.customPropertyMapping = {};

	}

	/**
	 * Starts loading from the given URL and passes the loaded PLY asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(BufferGeometry)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;

		const loader = new FileLoader( this.manager );
		loader.setPath( this.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( this.requestHeader );
		loader.setWithCredentials( this.withCredentials );
		loader.load( url, function ( text ) {

			try {

				onLoad( scope.parse( text ) );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	/**
	 * Sets a property name mapping that maps default property names
	 * to custom ones. For example, the following maps the properties
	 * “diffuse_(red|green|blue)” in the file to standard color names.
	 *
	 * ```js
	 * loader.setPropertyNameMapping( {
	 * 	diffuse_red: 'red',
	 * 	diffuse_green: 'green',
	 * 	diffuse_blue: 'blue'
	 * } );
	 * ```
	 *
	 * @param {Object} mapping - The mapping dictionary.
	 */
	setPropertyNameMapping( mapping ) {

		this.propertyNameMapping = mapping;

	}

	/**
	 * Custom properties outside of the defaults for position, uv, normal
	 * and color attributes can be added using the setCustomPropertyNameMapping method.
	 * For example, the following maps the element properties “custom_property_a”
	 * and “custom_property_b” to an attribute “customAttribute” with an item size of 2.
	 * Attribute item sizes are set from the number of element properties in the property array.
	 *
	 * ```js
	 * loader.setCustomPropertyNameMapping( {
	 *	customAttribute: ['custom_property_a', 'custom_property_b'],
	 * } );
	 * ```
	 * @param {Object} mapping - The mapping dictionary.
	 */
	setCustomPropertyNameMapping( mapping ) {

		this.customPropertyMapping = mapping;

	}

	/**
	 * Parses the given PLY data and returns the resulting geometry.
	 *
	 * @param {ArrayBuffer} data - The raw PLY data as an array buffer.
	 * @return {BufferGeometry} The parsed geometry.
	 */
	parse( data ) {

		function parseHeader( data, headerLength = 0 ) {

			const patternHeader = /^ply([\s\S]*)end_header(\r\n|\r|\n)/;
			let headerText = '';
			const result = patternHeader.exec( data );

			if ( result !== null ) {

				headerText = result[ 1 ];

			}

			const header = {
				comments: [],
				elements: [],
				headerLength: headerLength,
				objInfo: ''
			};

			const lines = headerText.split( /\r\n|\r|\n/ );
			let currentElement;

			function make_ply_element_property( propertyValues, propertyNameMapping ) {

				const property = { type: propertyValues[ 0 ] };

				if ( property.type === 'list' ) {

					property.name = propertyValues[ 3 ];
					property.countType = propertyValues[ 1 ];
					property.itemType = propertyValues[ 2 ];

				} else {

					property.name = propertyValues[ 1 ];

				}

				if ( property.name in propertyNameMapping ) {

					property.name = propertyNameMapping[ property.name ];

				}

				return property;

			}

			for ( let i = 0; i < lines.length; i ++ ) {

				let line = lines[ i ];
				line = line.trim();

				if ( line === '' ) continue;

				const lineValues = line.split( /\s+/ );
				const lineType = lineValues.shift();
				line = lineValues.join( ' ' );

				switch ( lineType ) {

					case 'format':

						header.format = lineValues[ 0 ];
						header.version = lineValues[ 1 ];

						break;

					case 'comment':

						header.comments.push( line );

						break;

					case 'element':

						if ( currentElement !== undefined ) {

							header.elements.push( currentElement );

						}

						currentElement = {};
						currentElement.name = lineValues[ 0 ];
						currentElement.count = parseInt( lineValues[ 1 ] );
						currentElement.properties = [];

						break;

					case 'property':

						currentElement.properties.push( make_ply_element_property( lineValues, scope.propertyNameMapping ) );

						break;

					case 'obj_info':

						header.objInfo = line;

						break;


					default:

						console.log( 'unhandled', lineType, lineValues );

				}

			}

			if ( currentElement !== undefined ) {

				header.elements.push( currentElement );

			}

			return header;

		}

		function parseASCIINumber( n, type ) {

			switch ( type ) {

				case 'char': case 'uchar': case 'short': case 'ushort': case 'int': case 'uint':
				case 'int8': case 'uint8': case 'int16': case 'uint16': case 'int32': case 'uint32':

					return parseInt( n );

				case 'float': case 'double': case 'float32': case 'float64':

					return parseFloat( n );

			}

		}

		function parseASCIIElement( properties, tokens ) {

			const element = {};

			for ( let i = 0; i < properties.length; i ++ ) {

				if ( tokens.empty() ) return null;

				if ( properties[ i ].type === 'list' ) {

					const list = [];
					const n = parseASCIINumber( tokens.next(), properties[ i ].countType );

					for ( let j = 0; j < n; j ++ ) {

						if ( tokens.empty() ) return null;

						list.push( parseASCIINumber( tokens.next(), properties[ i ].itemType ) );

					}

					element[ properties[ i ].name ] = list;

				} else {

					element[ properties[ i ].name ] = parseASCIINumber( tokens.next(), properties[ i ].type );

				}

			}

			return element;

		}

		function createBuffer() {

			const buffer = {
			  indices: [],
			  vertices: [],
			  normals: [],
			  uvs: [],
			  faceVertexUvs: [],
			  colors: [],
			  faceVertexColors: []
			};

			for ( const customProperty of Object.keys( scope.customPropertyMapping ) ) {

			  buffer[ customProperty ] = [];

			}

			return buffer;

		}

		function mapElementAttributes( properties ) {

			const elementNames = properties.map( property => {

				return property.name;

			} );

			function findAttrName( names ) {

				for ( let i = 0, l = names.length; i < l; i ++ ) {

					const name = names[ i ];

					if ( elementNames.includes( name ) ) return name;

				}

				return null;

			}

			return {
				attrX: findAttrName( [ 'x', 'px', 'posx' ] ) || 'x',
				attrY: findAttrName( [ 'y', 'py', 'posy' ] ) || 'y',
				attrZ: findAttrName( [ 'z', 'pz', 'posz' ] ) || 'z',
				attrNX: findAttrName( [ 'nx', 'normalx' ] ),
				attrNY: findAttrName( [ 'ny', 'normaly' ] ),
				attrNZ: findAttrName( [ 'nz', 'normalz' ] ),
				attrS: findAttrName( [ 's', 'u', 'texture_u', 'tx' ] ),
				attrT: findAttrName( [ 't', 'v', 'texture_v', 'ty' ] ),
				attrR: findAttrName( [ 'red', 'diffuse_red', 'r', 'diffuse_r' ] ),
				attrG: findAttrName( [ 'green', 'diffuse_green', 'g', 'diffuse_g' ] ),
				attrB: findAttrName( [ 'blue', 'diffuse_blue', 'b', 'diffuse_b' ] ),
			};

		}

		function parseASCII( data, header ) {

			// PLY ascii format specification, as per http://en.wikipedia.org/wiki/PLY_(file_format)

			const buffer = createBuffer();

			const patternBody = /end_header\s+(\S[\s\S]*\S|\S)\s*$/;
			let body, matches;

			if ( ( matches = patternBody.exec( data ) ) !== null ) {

				body = matches[ 1 ].split( /\s+/ );

			} else {

				body = [ ];

			}

			const tokens = new ArrayStream( body );

			loop: for ( let i = 0; i < header.elements.length; i ++ ) {

				const elementDesc = header.elements[ i ];
				const attributeMap = mapElementAttributes( elementDesc.properties );

				for ( let j = 0; j < elementDesc.count; j ++ ) {

					const element = parseASCIIElement( elementDesc.properties, tokens );

					if ( ! element ) break loop;

					handleElement( buffer, elementDesc.name, element, attributeMap );

				}

			}

			return postProcess( buffer );

		}

		function postProcess( buffer ) {

			let geometry = new BufferGeometry();

			// mandatory buffer data

			if ( buffer.indices.length > 0 ) {

				geometry.setIndex( buffer.indices );

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( buffer.vertices, 3 ) );

			// optional buffer data

			if ( buffer.normals.length > 0 ) {

				geometry.setAttribute( 'normal', new Float32BufferAttribute( buffer.normals, 3 ) );

			}

			if ( buffer.uvs.length > 0 ) {

				geometry.setAttribute( 'uv', new Float32BufferAttribute( buffer.uvs, 2 ) );

			}

			if ( buffer.colors.length > 0 ) {

				geometry.setAttribute( 'color', new Float32BufferAttribute( buffer.colors, 3 ) );

			}

			if ( buffer.faceVertexUvs.length > 0 || buffer.faceVertexColors.length > 0 ) {

				geometry = geometry.toNonIndexed();

				if ( buffer.faceVertexUvs.length > 0 ) geometry.setAttribute( 'uv', new Float32BufferAttribute( buffer.faceVertexUvs, 2 ) );
				if ( buffer.faceVertexColors.length > 0 ) geometry.setAttribute( 'color', new Float32BufferAttribute( buffer.faceVertexColors, 3 ) );

			}

			// custom buffer data

			for ( const customProperty of Object.keys( scope.customPropertyMapping ) ) {

				if ( buffer[ customProperty ].length > 0 ) {

				  	geometry.setAttribute(
						customProperty,
						new Float32BufferAttribute(
					  		buffer[ customProperty ],
					  		scope.customPropertyMapping[ customProperty ].length
						)
				  	);

				}

			}

			geometry.computeBoundingSphere();

			return geometry;

		}

		function handleElement( buffer, elementName, element, cacheEntry ) {

			if ( elementName === 'vertex' ) {

				buffer.vertices.push( element[ cacheEntry.attrX ], element[ cacheEntry.attrY ], element[ cacheEntry.attrZ ] );

				if ( cacheEntry.attrNX !== null && cacheEntry.attrNY !== null && cacheEntry.attrNZ !== null ) {

					buffer.normals.push( element[ cacheEntry.attrNX ], element[ cacheEntry.attrNY ], element[ cacheEntry.attrNZ ] );

				}

				if ( cacheEntry.attrS !== null && cacheEntry.attrT !== null ) {

					buffer.uvs.push( element[ cacheEntry.attrS ], element[ cacheEntry.attrT ] );

				}

				if ( cacheEntry.attrR !== null && cacheEntry.attrG !== null && cacheEntry.attrB !== null ) {

					_color.setRGB(
						element[ cacheEntry.attrR ] / 255.0,
						element[ cacheEntry.attrG ] / 255.0,
						element[ cacheEntry.attrB ] / 255.0,
						SRGBColorSpace
					);

					buffer.colors.push( _color.r, _color.g, _color.b );

				}

				for ( const customProperty of Object.keys( scope.customPropertyMapping ) ) {

					for ( const elementProperty of scope.customPropertyMapping[ customProperty ] ) {

					  buffer[ customProperty ].push( element[ elementProperty ] );

					}

				}

			} else if ( elementName === 'face' ) {

				const vertex_indices = element.vertex_indices || element.vertex_index; // issue #9338
				const texcoord = element.texcoord;

				if ( vertex_indices.length === 3 ) {

					buffer.indices.push( vertex_indices[ 0 ], vertex_indices[ 1 ], vertex_indices[ 2 ] );

					if ( texcoord && texcoord.length === 6 ) {

						buffer.faceVertexUvs.push( texcoord[ 0 ], texcoord[ 1 ] );
						buffer.faceVertexUvs.push( texcoord[ 2 ], texcoord[ 3 ] );
						buffer.faceVertexUvs.push( texcoord[ 4 ], texcoord[ 5 ] );

					}

				} else if ( vertex_indices.length === 4 ) {

					buffer.indices.push( vertex_indices[ 0 ], vertex_indices[ 1 ], vertex_indices[ 3 ] );
					buffer.indices.push( vertex_indices[ 1 ], vertex_indices[ 2 ], vertex_indices[ 3 ] );

				}

				// face colors

				if ( cacheEntry.attrR !== null && cacheEntry.attrG !== null && cacheEntry.attrB !== null ) {

					_color.setRGB(
						element[ cacheEntry.attrR ] / 255.0,
						element[ cacheEntry.attrG ] / 255.0,
						element[ cacheEntry.attrB ] / 255.0,
						SRGBColorSpace
					);
					buffer.faceVertexColors.push( _color.r, _color.g, _color.b );
					buffer.faceVertexColors.push( _color.r, _color.g, _color.b );
					buffer.faceVertexColors.push( _color.r, _color.g, _color.b );

				}

			}

		}

		function binaryReadElement( at, properties ) {

			const element = {};
			let read = 0;

			for ( let i = 0; i < properties.length; i ++ ) {

				const property = properties[ i ];
				const valueReader = property.valueReader;

				if ( property.type === 'list' ) {

					const list = [];

					const n = property.countReader.read( at + read );
					read += property.countReader.size;

					for ( let j = 0; j < n; j ++ ) {

						list.push( valueReader.read( at + read ) );
						read += valueReader.size;

					}

					element[ property.name ] = list;

				} else {

					element[ property.name ] = valueReader.read( at + read );
					read += valueReader.size;

				}

			}

			return [ element, read ];

		}

		function setPropertyBinaryReaders( properties, body, little_endian ) {

			function getBinaryReader( dataview, type, little_endian ) {

				switch ( type ) {

					// correspondences for non-specific length types here match rply:
					case 'int8':	case 'char':	return { read: ( at ) => {

						return dataview.getInt8( at );

					}, size: 1 };
					case 'uint8':	case 'uchar':	return { read: ( at ) => {

						return dataview.getUint8( at );

					}, size: 1 };
					case 'int16':	case 'short':	return { read: ( at ) => {

						return dataview.getInt16( at, little_endian );

					}, size: 2 };
					case 'uint16':	case 'ushort':	return { read: ( at ) => {

						return dataview.getUint16( at, little_endian );

					}, size: 2 };
					case 'int32':	case 'int':		return { read: ( at ) => {

						return dataview.getInt32( at, little_endian );

					}, size: 4 };
					case 'uint32':	case 'uint':	return { read: ( at ) => {

						return dataview.getUint32( at, little_endian );

					}, size: 4 };
					case 'float32': case 'float':	return { read: ( at ) => {

						return dataview.getFloat32( at, little_endian );

					}, size: 4 };
					case 'float64': case 'double':	return { read: ( at ) => {

						return dataview.getFloat64( at, little_endian );

					}, size: 8 };

				}

			}

			for ( let i = 0, l = properties.length; i < l; i ++ ) {

				const property = properties[ i ];

				if ( property.type === 'list' ) {

					property.countReader = getBinaryReader( body, property.countType, little_endian );
					property.valueReader = getBinaryReader( body, property.itemType, little_endian );

				} else {

					property.valueReader = getBinaryReader( body, property.type, little_endian );

				}

			}

		}

		function parseBinary( data, header ) {

			const buffer = createBuffer();

			const little_endian = ( header.format === 'binary_little_endian' );
			const body = new DataView( data, header.headerLength );
			let result, loc = 0;

			for ( let currentElement = 0; currentElement < header.elements.length; currentElement ++ ) {

				const elementDesc = header.elements[ currentElement ];
				const properties = elementDesc.properties;
				const attributeMap = mapElementAttributes( properties );

				setPropertyBinaryReaders( properties, body, little_endian );

				for ( let currentElementCount = 0; currentElementCount < elementDesc.count; currentElementCount ++ ) {

					result = binaryReadElement( loc, properties );
					loc += result[ 1 ];
					const element = result[ 0 ];

					handleElement( buffer, elementDesc.name, element, attributeMap );

				}

			}

			return postProcess( buffer );

		}

		function extractHeaderText( bytes ) {

			let i = 0;
			let cont = true;

			let line = '';
			const lines = [];

			const startLine = new TextDecoder().decode( bytes.subarray( 0, 5 ) );
			const hasCRNL = /^ply\r\n/.test( startLine );

			do {

				const c = String.fromCharCode( bytes[ i ++ ] );

				if ( c !== '\n' && c !== '\r' ) {

					line += c;

				} else {

					if ( line === 'end_header' ) cont = false;
					if ( line !== '' ) {

						lines.push( line );
						line = '';

					}

				}

			} while ( cont && i < bytes.length );

			// ascii section using \r\n as line endings
			if ( hasCRNL === true ) i ++;

			return { headerText: lines.join( '\r' ) + '\r', headerLength: i };

		}

		//

		let geometry;
		const scope = this;

		if ( data instanceof ArrayBuffer ) {

			const bytes = new Uint8Array( data );
			const { headerText, headerLength } = extractHeaderText( bytes );
			const header = parseHeader( headerText, headerLength );

			if ( header.format === 'ascii' ) {

				const text = new TextDecoder().decode( bytes );

				geometry = parseASCII( text, header );

			} else {

				geometry = parseBinary( data, header );

			}

		} else {

			geometry = parseASCII( data, parseHeader( data ) );

		}

		return geometry;

	}

}

class ArrayStream {

	constructor( arr ) {

		this.arr = arr;
		this.i = 0;

	}

	empty() {

		return this.i >= this.arr.length;

	}

	next() {

		return this.arr[ this.i ++ ];

	}

}

const COLOR_SPACE_3MF = SRGBColorSpace;

/**
 * A loader for the [3D Manufacturing Format (3MF)](https://3mf.io/specification/) format.
 *
 * The following features from the core specification are supported:
 *
 * - 3D Models
 * - Object Resources (Meshes and Components)
 * - Material Resources (Base Materials)
 *
 * 3MF Materials and Properties Extension are only partially supported.
 *
 * - Texture 2D
 * - Texture 2D Groups
 * - Color Groups (Vertex Colors)
 * - Metallic Display Properties (PBR)
 *
 * ```js
 * const loader = new ThreeMFLoader();
 *
 * const object = await loader.loadAsync( './models/3mf/truck.3mf' );
 * object.rotation.set( - Math.PI / 2, 0, 0 ); // z-up conversion
 * scene.add( object );
 * ```
 *
 * @augments Loader
 * @three_import import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
 */
class ThreeMFLoader extends Loader {

	/**
	 * Constructs a new 3MF loader.
	 *
	 * @param {LoadingManager} [manager] - The loading manager.
	 */
	constructor( manager ) {

		super( manager );

		/**
		 * An array of available extensions.
		 *
		 * @type {Array<Object>}
		 */
		this.availableExtensions = [];

	}

	/**
	 * Starts loading from the given URL and passes the loaded 3MF asset
	 * to the `onLoad()` callback.
	 *
	 * @param {string} url - The path/URL of the file to be loaded. This can also be a data URI.
	 * @param {function(Group)} onLoad - Executed when the loading process has been finished.
	 * @param {onProgressCallback} onProgress - Executed while the loading is in progress.
	 * @param {onErrorCallback} onError - Executed when errors occur.
	 */
	load( url, onLoad, onProgress, onError ) {

		const scope = this;
		const loader = new FileLoader( scope.manager );
		loader.setPath( scope.path );
		loader.setResponseType( 'arraybuffer' );
		loader.setRequestHeader( scope.requestHeader );
		loader.setWithCredentials( scope.withCredentials );
		loader.load( url, function ( buffer ) {

			try {

				onLoad( scope.parse( buffer ) );

			} catch ( e ) {

				if ( onError ) {

					onError( e );

				} else {

					console.error( e );

				}

				scope.manager.itemError( url );

			}

		}, onProgress, onError );

	}

	/**
	 * Parses the given 3MF data and returns the resulting group.
	 *
	 * @param {ArrayBuffer} data - The raw 3MF asset data as an array buffer.
	 * @return {Group} A group representing the parsed asset.
	 */
	parse( data ) {

		const scope = this;
		const textureLoader = new TextureLoader( this.manager );

		function loadDocument( data ) {

			let zip = null;
			let file = null;

			let relsName;
			let modelRelsName;
			const modelPartNames = [];
			const texturesPartNames = [];

			let modelRels;
			const modelParts = {};
			const printTicketParts = {};
			const texturesParts = {};

			const textDecoder = new TextDecoder();

			try {

				zip = unzipSync( new Uint8Array( data ) );

			} catch ( e ) {

				if ( e instanceof ReferenceError ) {

					console.error( 'THREE.3MFLoader: fflate missing and file is compressed.' );
					return null;

				}

			}

			let rootModelFile = null;

			for ( file in zip ) {

				if ( file.match( /\_rels\/.rels$/ ) ) {

					relsName = file;

				} else if ( file.match( /3D\/_rels\/.*\.model\.rels$/ ) ) {

					modelRelsName = file;

				} else if ( file.match( /^3D\/[^\/]*\.model$/ ) ) {

					rootModelFile = file;

				} else if ( file.match( /^3D\/.*\/.*\.model$/ ) ) {

					modelPartNames.push( file ); // sub models

				} else if ( file.match( /^3D\/Textures?\/.*/ ) ) {

					texturesPartNames.push( file );

				}

			}

			modelPartNames.push( rootModelFile ); // push root model at the end so it is processed after the sub models

			if ( relsName === undefined ) throw new Error( 'THREE.ThreeMFLoader: Cannot find relationship file `rels` in 3MF archive.' );

			//

			const relsView = zip[ relsName ];
			const relsFileText = textDecoder.decode( relsView );
			const rels = parseRelsXml( relsFileText );

			//

			if ( modelRelsName ) {

				const relsView = zip[ modelRelsName ];
				const relsFileText = textDecoder.decode( relsView );
				modelRels = parseRelsXml( relsFileText );

			}

			//

			for ( let i = 0; i < modelPartNames.length; i ++ ) {

				const modelPart = modelPartNames[ i ];
				const view = zip[ modelPart ];

				const fileText = textDecoder.decode( view );
				const xmlData = new DOMParser().parseFromString( fileText, 'application/xml' );

				if ( xmlData.documentElement.nodeName.toLowerCase() !== 'model' ) {

					console.error( 'THREE.3MFLoader: Error loading 3MF - no 3MF document found: ', modelPart );

				}

				const modelNode = xmlData.querySelector( 'model' );
				const extensions = {};

				for ( let i = 0; i < modelNode.attributes.length; i ++ ) {

					const attr = modelNode.attributes[ i ];
					if ( attr.name.match( /^xmlns:(.+)$/ ) ) {

						extensions[ attr.value ] = RegExp.$1;

					}

				}

				const modelData = parseModelNode( modelNode );
				modelData[ 'xml' ] = modelNode;

				if ( 0 < Object.keys( extensions ).length ) {

					modelData[ 'extensions' ] = extensions;

				}

				modelParts[ modelPart ] = modelData;

			}

			//

			for ( let i = 0; i < texturesPartNames.length; i ++ ) {

				const texturesPartName = texturesPartNames[ i ];
				texturesParts[ texturesPartName ] = zip[ texturesPartName ].buffer;

			}

			return {
				rels: rels,
				modelRels: modelRels,
				model: modelParts,
				printTicket: printTicketParts,
				texture: texturesParts
			};

		}

		function parseRelsXml( relsFileText ) {

			const relationships = [];

			const relsXmlData = new DOMParser().parseFromString( relsFileText, 'application/xml' );

			const relsNodes = relsXmlData.querySelectorAll( 'Relationship' );

			for ( let i = 0; i < relsNodes.length; i ++ ) {

				const relsNode = relsNodes[ i ];

				const relationship = {
					target: relsNode.getAttribute( 'Target' ), //required
					id: relsNode.getAttribute( 'Id' ), //required
					type: relsNode.getAttribute( 'Type' ) //required
				};

				relationships.push( relationship );

			}

			return relationships;

		}

		function parseMetadataNodes( metadataNodes ) {

			const metadataData = {};

			for ( let i = 0; i < metadataNodes.length; i ++ ) {

				const metadataNode = metadataNodes[ i ];
				const name = metadataNode.getAttribute( 'name' );
				const validNames = [
					'Title',
					'Designer',
					'Description',
					'Copyright',
					'LicenseTerms',
					'Rating',
					'CreationDate',
					'ModificationDate'
				];

				if ( 0 <= validNames.indexOf( name ) ) {

					metadataData[ name ] = metadataNode.textContent;

				}

			}

			return metadataData;

		}

		function parseBasematerialsNode( basematerialsNode ) {

			const basematerialsData = {
				id: basematerialsNode.getAttribute( 'id' ), // required
				basematerials: []
			};

			const basematerialNodes = basematerialsNode.querySelectorAll( 'base' );

			for ( let i = 0; i < basematerialNodes.length; i ++ ) {

				const basematerialNode = basematerialNodes[ i ];
				const basematerialData = parseBasematerialNode( basematerialNode );
				basematerialData.index = i; // the order and count of the material nodes form an implicit 0-based index
				basematerialsData.basematerials.push( basematerialData );

			}

			return basematerialsData;

		}

		function parseTexture2DNode( texture2DNode ) {

			const texture2dData = {
				id: texture2DNode.getAttribute( 'id' ), // required
				path: texture2DNode.getAttribute( 'path' ), // required
				contenttype: texture2DNode.getAttribute( 'contenttype' ), // required
				tilestyleu: texture2DNode.getAttribute( 'tilestyleu' ),
				tilestylev: texture2DNode.getAttribute( 'tilestylev' ),
				filter: texture2DNode.getAttribute( 'filter' ),
			};

			return texture2dData;

		}

		function parseTextures2DGroupNode( texture2DGroupNode ) {

			const texture2DGroupData = {
				id: texture2DGroupNode.getAttribute( 'id' ), // required
				texid: texture2DGroupNode.getAttribute( 'texid' ), // required
				displaypropertiesid: texture2DGroupNode.getAttribute( 'displaypropertiesid' )
			};

			const tex2coordNodes = texture2DGroupNode.querySelectorAll( 'tex2coord' );

			const uvs = [];

			for ( let i = 0; i < tex2coordNodes.length; i ++ ) {

				const tex2coordNode = tex2coordNodes[ i ];
				const u = tex2coordNode.getAttribute( 'u' );
				const v = tex2coordNode.getAttribute( 'v' );

				uvs.push( parseFloat( u ), parseFloat( v ) );

			}

			texture2DGroupData[ 'uvs' ] = new Float32Array( uvs );

			return texture2DGroupData;

		}

		function parseColorGroupNode( colorGroupNode ) {

			const colorGroupData = {
				id: colorGroupNode.getAttribute( 'id' ), // required
				displaypropertiesid: colorGroupNode.getAttribute( 'displaypropertiesid' )
			};

			const colorNodes = colorGroupNode.querySelectorAll( 'color' );

			const colors = [];
			const colorObject = new Color();

			for ( let i = 0; i < colorNodes.length; i ++ ) {

				const colorNode = colorNodes[ i ];
				const color = colorNode.getAttribute( 'color' );

				colorObject.setStyle( color.substring( 0, 7 ), COLOR_SPACE_3MF );

				colors.push( colorObject.r, colorObject.g, colorObject.b );

			}

			colorGroupData[ 'colors' ] = new Float32Array( colors );

			return colorGroupData;

		}

		function parseImplicitIONode( implicitIONode ) {

			const portNodes = implicitIONode.children;
			const portArguments = {};
			for ( let i = 0; i < portNodes.length; i ++ ) {

				const args = { type: portNodes[ i ].nodeName.substring( 2 ) };
				for ( let j = 0; j < portNodes[ i ].attributes.length; j ++ ) {

					const attrib = portNodes[ i ].attributes[ j ];
					if ( attrib.specified ) {

		 				args[ attrib.name ] = attrib.value;

					}

				}

				portArguments[ portNodes[ i ].getAttribute( 'identifier' ) ] = args;

			}

			return portArguments;

		}

		function parseImplicitFunctionNode( implicitFunctionNode ) {

			const implicitFunctionData = {
				id: implicitFunctionNode.getAttribute( 'id' ),
				displayname: implicitFunctionNode.getAttribute( 'displayname' )
			};

			const functionNodes = implicitFunctionNode.children;

			const operations = {};

			for ( let i = 0; i < functionNodes.length; i ++ ) {

				const operatorNode = functionNodes[ i ];

				if ( operatorNode.nodeName === 'i:in' || operatorNode.nodeName === 'i:out' ) {

					operations[ operatorNode.nodeName === 'i:in' ? 'inputs' : 'outputs' ] = parseImplicitIONode( operatorNode );

				} else {

					const inputNodes = operatorNode.children;
					const portArguments = { 'op': operatorNode.nodeName.substring( 2 ), 'identifier': operatorNode.getAttribute( 'identifier' ) };
					for ( let i = 0; i < inputNodes.length; i ++ ) {

						portArguments[ inputNodes[ i ].nodeName.substring( 2 ) ] = parseImplicitIONode( inputNodes[ i ] );

					}

					operations[ portArguments[ 'identifier' ] ] = portArguments;

				}

			}

			implicitFunctionData[ 'operations' ] = operations;

			return implicitFunctionData;

		}

		function parseMetallicDisplaypropertiesNode( metallicDisplaypropetiesNode ) {

			const metallicDisplaypropertiesData = {
				id: metallicDisplaypropetiesNode.getAttribute( 'id' ) // required
			};

			const metallicNodes = metallicDisplaypropetiesNode.querySelectorAll( 'pbmetallic' );

			const metallicData = [];

			for ( let i = 0; i < metallicNodes.length; i ++ ) {

				const metallicNode = metallicNodes[ i ];

				metallicData.push( {
					name: metallicNode.getAttribute( 'name' ), // required
					metallicness: parseFloat( metallicNode.getAttribute( 'metallicness' ) ), // required
					roughness: parseFloat( metallicNode.getAttribute( 'roughness' ) ) // required
				} );

			}

			metallicDisplaypropertiesData.data = metallicData;

			return metallicDisplaypropertiesData;

		}

		function parseBasematerialNode( basematerialNode ) {

			const basematerialData = {};

			basematerialData[ 'name' ] = basematerialNode.getAttribute( 'name' ); // required
			basematerialData[ 'displaycolor' ] = basematerialNode.getAttribute( 'displaycolor' ); // required
			basematerialData[ 'displaypropertiesid' ] = basematerialNode.getAttribute( 'displaypropertiesid' );

			return basematerialData;

		}

		function parseMeshNode( meshNode ) {

			const meshData = {};

			const vertices = [];
			const vertexNodes = meshNode.querySelectorAll( 'vertices vertex' );

			for ( let i = 0; i < vertexNodes.length; i ++ ) {

				const vertexNode = vertexNodes[ i ];
				const x = vertexNode.getAttribute( 'x' );
				const y = vertexNode.getAttribute( 'y' );
				const z = vertexNode.getAttribute( 'z' );

				vertices.push( parseFloat( x ), parseFloat( y ), parseFloat( z ) );

			}

			meshData[ 'vertices' ] = new Float32Array( vertices );

			const triangleProperties = [];
			const triangles = [];
			const triangleNodes = meshNode.querySelectorAll( 'triangles triangle' );

			for ( let i = 0; i < triangleNodes.length; i ++ ) {

				const triangleNode = triangleNodes[ i ];
				const v1 = triangleNode.getAttribute( 'v1' );
				const v2 = triangleNode.getAttribute( 'v2' );
				const v3 = triangleNode.getAttribute( 'v3' );
				const p1 = triangleNode.getAttribute( 'p1' );
				const p2 = triangleNode.getAttribute( 'p2' );
				const p3 = triangleNode.getAttribute( 'p3' );
				const pid = triangleNode.getAttribute( 'pid' );

				const triangleProperty = {};

				triangleProperty[ 'v1' ] = parseInt( v1, 10 );
				triangleProperty[ 'v2' ] = parseInt( v2, 10 );
				triangleProperty[ 'v3' ] = parseInt( v3, 10 );

				triangles.push( triangleProperty[ 'v1' ], triangleProperty[ 'v2' ], triangleProperty[ 'v3' ] );

				// optional

				if ( p1 ) {

					triangleProperty[ 'p1' ] = parseInt( p1, 10 );

				}

				if ( p2 ) {

					triangleProperty[ 'p2' ] = parseInt( p2, 10 );

				}

				if ( p3 ) {

					triangleProperty[ 'p3' ] = parseInt( p3, 10 );

				}

				if ( pid ) {

					triangleProperty[ 'pid' ] = pid;

				}

				if ( 0 < Object.keys( triangleProperty ).length ) {

					triangleProperties.push( triangleProperty );

				}

			}

			meshData[ 'triangleProperties' ] = triangleProperties;
			meshData[ 'triangles' ] = new Uint32Array( triangles );

			return meshData;

		}

		function parseComponentsNode( componentsNode ) {

			const components = [];

			const componentNodes = componentsNode.querySelectorAll( 'component' );

			for ( let i = 0; i < componentNodes.length; i ++ ) {

				const componentNode = componentNodes[ i ];
				const componentData = parseComponentNode( componentNode );
				components.push( componentData );

			}

			return components;

		}

		function parseComponentNode( componentNode ) {

			const componentData = {};

			componentData[ 'objectId' ] = componentNode.getAttribute( 'objectid' ); // required

			const transform = componentNode.getAttribute( 'transform' );

			if ( transform ) {

				componentData[ 'transform' ] = parseTransform( transform );

			}

			return componentData;

		}

		function parseTransform( transform ) {

			const t = [];
			transform.split( ' ' ).forEach( function ( s ) {

				t.push( parseFloat( s ) );

			} );

			const matrix = new Matrix4();
			matrix.set(
				t[ 0 ], t[ 3 ], t[ 6 ], t[ 9 ],
				t[ 1 ], t[ 4 ], t[ 7 ], t[ 10 ],
				t[ 2 ], t[ 5 ], t[ 8 ], t[ 11 ],
				 0.0, 0.0, 0.0, 1.0
			);

			return matrix;

		}

		function parseObjectNode( objectNode ) {

			const objectData = {
				type: objectNode.getAttribute( 'type' )
			};

			const id = objectNode.getAttribute( 'id' );

			if ( id ) {

				objectData[ 'id' ] = id;

			}

			const pid = objectNode.getAttribute( 'pid' );

			if ( pid ) {

				objectData[ 'pid' ] = pid;

			}

			const pindex = objectNode.getAttribute( 'pindex' );

			if ( pindex ) {

				objectData[ 'pindex' ] = pindex;

			}

			const thumbnail = objectNode.getAttribute( 'thumbnail' );

			if ( thumbnail ) {

				objectData[ 'thumbnail' ] = thumbnail;

			}

			const partnumber = objectNode.getAttribute( 'partnumber' );

			if ( partnumber ) {

				objectData[ 'partnumber' ] = partnumber;

			}

			const name = objectNode.getAttribute( 'name' );

			if ( name ) {

				objectData[ 'name' ] = name;

			}

			const meshNode = objectNode.querySelector( 'mesh' );

			if ( meshNode ) {

				objectData[ 'mesh' ] = parseMeshNode( meshNode );

			}

			const componentsNode = objectNode.querySelector( 'components' );

			if ( componentsNode ) {

				objectData[ 'components' ] = parseComponentsNode( componentsNode );

			}

			return objectData;

		}

		function parseResourcesNode( resourcesNode ) {

			const resourcesData = {};

			resourcesData[ 'basematerials' ] = {};
			const basematerialsNodes = resourcesNode.querySelectorAll( 'basematerials' );

			for ( let i = 0; i < basematerialsNodes.length; i ++ ) {

				const basematerialsNode = basematerialsNodes[ i ];
				const basematerialsData = parseBasematerialsNode( basematerialsNode );
				resourcesData[ 'basematerials' ][ basematerialsData[ 'id' ] ] = basematerialsData;

			}

			//

			resourcesData[ 'texture2d' ] = {};
			const textures2DNodes = resourcesNode.querySelectorAll( 'texture2d' );

			for ( let i = 0; i < textures2DNodes.length; i ++ ) {

				const textures2DNode = textures2DNodes[ i ];
				const texture2DData = parseTexture2DNode( textures2DNode );
				resourcesData[ 'texture2d' ][ texture2DData[ 'id' ] ] = texture2DData;

			}

			//

			resourcesData[ 'colorgroup' ] = {};
			const colorGroupNodes = resourcesNode.querySelectorAll( 'colorgroup' );

			for ( let i = 0; i < colorGroupNodes.length; i ++ ) {

				const colorGroupNode = colorGroupNodes[ i ];
				const colorGroupData = parseColorGroupNode( colorGroupNode );
				resourcesData[ 'colorgroup' ][ colorGroupData[ 'id' ] ] = colorGroupData;

			}

			//

			const implicitFunctionNodes = resourcesNode.querySelectorAll( 'implicitfunction' );

			if ( implicitFunctionNodes.length > 0 ) {

				resourcesData[ 'implicitfunction' ] = {};

			}


			for ( let i = 0; i < implicitFunctionNodes.length; i ++ ) {

				const implicitFunctionNode = implicitFunctionNodes[ i ];
				const implicitFunctionData = parseImplicitFunctionNode( implicitFunctionNode );
				resourcesData[ 'implicitfunction' ][ implicitFunctionData[ 'id' ] ] = implicitFunctionData;

			}

			//

			resourcesData[ 'pbmetallicdisplayproperties' ] = {};
			const pbmetallicdisplaypropertiesNodes = resourcesNode.querySelectorAll( 'pbmetallicdisplayproperties' );

			for ( let i = 0; i < pbmetallicdisplaypropertiesNodes.length; i ++ ) {

				const pbmetallicdisplaypropertiesNode = pbmetallicdisplaypropertiesNodes[ i ];
				const pbmetallicdisplaypropertiesData = parseMetallicDisplaypropertiesNode( pbmetallicdisplaypropertiesNode );
				resourcesData[ 'pbmetallicdisplayproperties' ][ pbmetallicdisplaypropertiesData[ 'id' ] ] = pbmetallicdisplaypropertiesData;

			}

			//

			resourcesData[ 'texture2dgroup' ] = {};
			const textures2DGroupNodes = resourcesNode.querySelectorAll( 'texture2dgroup' );

			for ( let i = 0; i < textures2DGroupNodes.length; i ++ ) {

				const textures2DGroupNode = textures2DGroupNodes[ i ];
				const textures2DGroupData = parseTextures2DGroupNode( textures2DGroupNode );
				resourcesData[ 'texture2dgroup' ][ textures2DGroupData[ 'id' ] ] = textures2DGroupData;

			}

			//

			resourcesData[ 'object' ] = {};
			const objectNodes = resourcesNode.querySelectorAll( 'object' );

			for ( let i = 0; i < objectNodes.length; i ++ ) {

				const objectNode = objectNodes[ i ];
				const objectData = parseObjectNode( objectNode );
				resourcesData[ 'object' ][ objectData[ 'id' ] ] = objectData;

			}

			return resourcesData;

		}

		function parseBuildNode( buildNode ) {

			const buildData = [];
			const itemNodes = buildNode.querySelectorAll( 'item' );

			for ( let i = 0; i < itemNodes.length; i ++ ) {

				const itemNode = itemNodes[ i ];
				const buildItem = {
					objectId: itemNode.getAttribute( 'objectid' )
				};
				const transform = itemNode.getAttribute( 'transform' );

				if ( transform ) {

					buildItem[ 'transform' ] = parseTransform( transform );

				}

				buildData.push( buildItem );

			}

			return buildData;

		}

		function parseModelNode( modelNode ) {

			const modelData = { unit: modelNode.getAttribute( 'unit' ) || 'millimeter' };
			const metadataNodes = modelNode.querySelectorAll( 'metadata' );

			if ( metadataNodes ) {

				modelData[ 'metadata' ] = parseMetadataNodes( metadataNodes );

			}

			const resourcesNode = modelNode.querySelector( 'resources' );

			if ( resourcesNode ) {

				modelData[ 'resources' ] = parseResourcesNode( resourcesNode );

			}

			const buildNode = modelNode.querySelector( 'build' );

			if ( buildNode ) {

				modelData[ 'build' ] = parseBuildNode( buildNode );

			}

			return modelData;

		}

		function buildTexture( texture2dgroup, objects, modelData, textureData ) {

			const texid = texture2dgroup.texid;
			const texture2ds = modelData.resources.texture2d;
			const texture2d = texture2ds[ texid ];

			if ( texture2d ) {

				const data = textureData[ texture2d.path ];
				const type = texture2d.contenttype;

				const blob = new Blob( [ data ], { type: type } );
				const sourceURI = URL.createObjectURL( blob );

				const texture = textureLoader.load( sourceURI, function () {

					URL.revokeObjectURL( sourceURI );

				} );

				texture.colorSpace = COLOR_SPACE_3MF;

				// texture parameters

				switch ( texture2d.tilestyleu ) {

					case 'wrap':
						texture.wrapS = RepeatWrapping;
						break;

					case 'mirror':
						texture.wrapS = MirroredRepeatWrapping;
						break;

					case 'none':
					case 'clamp':
						texture.wrapS = ClampToEdgeWrapping;
						break;

					default:
						texture.wrapS = RepeatWrapping;

				}

				switch ( texture2d.tilestylev ) {

					case 'wrap':
						texture.wrapT = RepeatWrapping;
						break;

					case 'mirror':
						texture.wrapT = MirroredRepeatWrapping;
						break;

					case 'none':
					case 'clamp':
						texture.wrapT = ClampToEdgeWrapping;
						break;

					default:
						texture.wrapT = RepeatWrapping;

				}

				switch ( texture2d.filter ) {

					case 'auto':
						texture.magFilter = LinearFilter;
						texture.minFilter = LinearMipmapLinearFilter;
						break;

					case 'linear':
						texture.magFilter = LinearFilter;
						texture.minFilter = LinearFilter;
						texture.generateMipmaps = false;
						break;

					case 'nearest':
						texture.magFilter = NearestFilter;
						texture.minFilter = NearestFilter;
						texture.generateMipmaps = false;
						break;

					default:
						texture.magFilter = LinearFilter;
						texture.minFilter = LinearMipmapLinearFilter;

				}

				return texture;

			} else {

				return null;

			}

		}

		function buildBasematerialsMeshes( basematerials, triangleProperties, meshData, objects, modelData, textureData, objectData ) {

			const objectPindex = objectData.pindex;

			const materialMap = {};

			for ( let i = 0, l = triangleProperties.length; i < l; i ++ ) {

				const triangleProperty = triangleProperties[ i ];
				const pindex = ( triangleProperty.p1 !== undefined ) ? triangleProperty.p1 : objectPindex;

				if ( materialMap[ pindex ] === undefined ) materialMap[ pindex ] = [];

				materialMap[ pindex ].push( triangleProperty );

			}

			//

			const keys = Object.keys( materialMap );
			const meshes = [];

			for ( let i = 0, l = keys.length; i < l; i ++ ) {

				const materialIndex = keys[ i ];
				const trianglePropertiesProps = materialMap[ materialIndex ];
				const basematerialData = basematerials.basematerials[ materialIndex ];
				const material = getBuild( basematerialData, objects, modelData, textureData, objectData, buildBasematerial );

				//

				const geometry = new BufferGeometry();

				const positionData = [];

				const vertices = meshData.vertices;

				for ( let j = 0, jl = trianglePropertiesProps.length; j < jl; j ++ ) {

					const triangleProperty = trianglePropertiesProps[ j ];

					positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 0 ] );
					positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 1 ] );
					positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 2 ] );

					positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 0 ] );
					positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 1 ] );
					positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 2 ] );

					positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 0 ] );
					positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 1 ] );
					positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 2 ] );


				}

				geometry.setAttribute( 'position', new Float32BufferAttribute( positionData, 3 ) );

				//

				const mesh = new Mesh( geometry, material );
				meshes.push( mesh );

			}

			return meshes;

		}

		function buildTexturedMesh( texture2dgroup, triangleProperties, meshData, objects, modelData, textureData, objectData ) {

			// geometry

			const geometry = new BufferGeometry();

			const positionData = [];
			const uvData = [];

			const vertices = meshData.vertices;
			const uvs = texture2dgroup.uvs;

			for ( let i = 0, l = triangleProperties.length; i < l; i ++ ) {

				const triangleProperty = triangleProperties[ i ];

				positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 0 ] );
				positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 1 ] );
				positionData.push( vertices[ ( triangleProperty.v1 * 3 ) + 2 ] );

				positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 0 ] );
				positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 1 ] );
				positionData.push( vertices[ ( triangleProperty.v2 * 3 ) + 2 ] );

				positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 0 ] );
				positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 1 ] );
				positionData.push( vertices[ ( triangleProperty.v3 * 3 ) + 2 ] );

				//

				uvData.push( uvs[ ( triangleProperty.p1 * 2 ) + 0 ] );
				uvData.push( uvs[ ( triangleProperty.p1 * 2 ) + 1 ] );

				uvData.push( uvs[ ( triangleProperty.p2 * 2 ) + 0 ] );
				uvData.push( uvs[ ( triangleProperty.p2 * 2 ) + 1 ] );

				uvData.push( uvs[ ( triangleProperty.p3 * 2 ) + 0 ] );
				uvData.push( uvs[ ( triangleProperty.p3 * 2 ) + 1 ] );

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positionData, 3 ) );
			geometry.setAttribute( 'uv', new Float32BufferAttribute( uvData, 2 ) );

			// material

			const texture = getBuild( texture2dgroup, objects, modelData, textureData, objectData, buildTexture );

			const material = new MeshPhongMaterial( { map: texture, flatShading: true } );

			// mesh

			const mesh = new Mesh( geometry, material );

			return mesh;

		}

		function buildVertexColorMesh( colorgroup, triangleProperties, meshData, objectData ) {

			// geometry

			const geometry = new BufferGeometry();

			const positionData = [];
			const colorData = [];

			const vertices = meshData.vertices;
			const colors = colorgroup.colors;

			for ( let i = 0, l = triangleProperties.length; i < l; i ++ ) {

				const triangleProperty = triangleProperties[ i ];

				const v1 = triangleProperty.v1;
				const v2 = triangleProperty.v2;
				const v3 = triangleProperty.v3;

				positionData.push( vertices[ ( v1 * 3 ) + 0 ] );
				positionData.push( vertices[ ( v1 * 3 ) + 1 ] );
				positionData.push( vertices[ ( v1 * 3 ) + 2 ] );

				positionData.push( vertices[ ( v2 * 3 ) + 0 ] );
				positionData.push( vertices[ ( v2 * 3 ) + 1 ] );
				positionData.push( vertices[ ( v2 * 3 ) + 2 ] );

				positionData.push( vertices[ ( v3 * 3 ) + 0 ] );
				positionData.push( vertices[ ( v3 * 3 ) + 1 ] );
				positionData.push( vertices[ ( v3 * 3 ) + 2 ] );

				//

				const p1 = ( triangleProperty.p1 !== undefined ) ? triangleProperty.p1 : objectData.pindex;
				const p2 = ( triangleProperty.p2 !== undefined ) ? triangleProperty.p2 : p1;
				const p3 = ( triangleProperty.p3 !== undefined ) ? triangleProperty.p3 : p1;

				colorData.push( colors[ ( p1 * 3 ) + 0 ] );
				colorData.push( colors[ ( p1 * 3 ) + 1 ] );
				colorData.push( colors[ ( p1 * 3 ) + 2 ] );

				colorData.push( colors[ ( p2 * 3 ) + 0 ] );
				colorData.push( colors[ ( p2 * 3 ) + 1 ] );
				colorData.push( colors[ ( p2 * 3 ) + 2 ] );

				colorData.push( colors[ ( p3 * 3 ) + 0 ] );
				colorData.push( colors[ ( p3 * 3 ) + 1 ] );
				colorData.push( colors[ ( p3 * 3 ) + 2 ] );

			}

			geometry.setAttribute( 'position', new Float32BufferAttribute( positionData, 3 ) );
			geometry.setAttribute( 'color', new Float32BufferAttribute( colorData, 3 ) );

			// material

			const material = new MeshPhongMaterial( { vertexColors: true, flatShading: true } );

			// mesh

			const mesh = new Mesh( geometry, material );

			return mesh;

		}

		function buildDefaultMesh( meshData ) {

			const geometry = new BufferGeometry();
			geometry.setIndex( new BufferAttribute( meshData[ 'triangles' ], 1 ) );
			geometry.setAttribute( 'position', new BufferAttribute( meshData[ 'vertices' ], 3 ) );

			const material = new MeshPhongMaterial( {
				name: Loader.DEFAULT_MATERIAL_NAME,
				color: 0xffffff,
				flatShading: true
			} );

			const mesh = new Mesh( geometry, material );

			return mesh;

		}

		function buildMeshes( resourceMap, meshData, objects, modelData, textureData, objectData ) {

			const keys = Object.keys( resourceMap );
			const meshes = [];

			for ( let i = 0, il = keys.length; i < il; i ++ ) {

				const resourceId = keys[ i ];
				const triangleProperties = resourceMap[ resourceId ];
				const resourceType = getResourceType( resourceId, modelData );

				switch ( resourceType ) {

					case 'material':
						const basematerials = modelData.resources.basematerials[ resourceId ];
						const newMeshes = buildBasematerialsMeshes( basematerials, triangleProperties, meshData, objects, modelData, textureData, objectData );

						for ( let j = 0, jl = newMeshes.length; j < jl; j ++ ) {

							meshes.push( newMeshes[ j ] );

						}

						break;

					case 'texture':
						const texture2dgroup = modelData.resources.texture2dgroup[ resourceId ];
						meshes.push( buildTexturedMesh( texture2dgroup, triangleProperties, meshData, objects, modelData, textureData, objectData ) );
						break;

					case 'vertexColors':
						const colorgroup = modelData.resources.colorgroup[ resourceId ];
						meshes.push( buildVertexColorMesh( colorgroup, triangleProperties, meshData, objectData ) );
						break;

					case 'default':
						meshes.push( buildDefaultMesh( meshData ) );
						break;

					default:
						console.error( 'THREE.3MFLoader: Unsupported resource type.' );

				}

			}

			if ( objectData.name ) {

				for ( let i = 0; i < meshes.length; i ++ ) {

					meshes[ i ].name = objectData.name;

				}

			}

			return meshes;

		}

		function getResourceType( pid, modelData ) {

			if ( modelData.resources.texture2dgroup[ pid ] !== undefined ) {

				return 'texture';

			} else if ( modelData.resources.basematerials[ pid ] !== undefined ) {

				return 'material';

			} else if ( modelData.resources.colorgroup[ pid ] !== undefined ) {

				return 'vertexColors';

			} else if ( pid === 'default' ) {

				return 'default';

			} else {

				return undefined;

			}

		}

		function analyzeObject( meshData, objectData ) {

			const resourceMap = {};

			const triangleProperties = meshData[ 'triangleProperties' ];

			const objectPid = objectData.pid;

			for ( let i = 0, l = triangleProperties.length; i < l; i ++ ) {

				const triangleProperty = triangleProperties[ i ];
				let pid = ( triangleProperty.pid !== undefined ) ? triangleProperty.pid : objectPid;

				if ( pid === undefined ) pid = 'default';

				if ( resourceMap[ pid ] === undefined ) resourceMap[ pid ] = [];

				resourceMap[ pid ].push( triangleProperty );

			}

			return resourceMap;

		}

		function buildGroup( meshData, objects, modelData, textureData, objectData ) {

			const group = new Group();

			const resourceMap = analyzeObject( meshData, objectData );
			const meshes = buildMeshes( resourceMap, meshData, objects, modelData, textureData, objectData );

			for ( let i = 0, l = meshes.length; i < l; i ++ ) {

				group.add( meshes[ i ] );

			}

			return group;

		}

		function applyExtensions( extensions, meshData, modelXml ) {

			if ( ! extensions ) {

				return;

			}

			const availableExtensions = [];
			const keys = Object.keys( extensions );

			for ( let i = 0; i < keys.length; i ++ ) {

				const ns = keys[ i ];

				for ( let j = 0; j < scope.availableExtensions.length; j ++ ) {

					const extension = scope.availableExtensions[ j ];

					if ( extension.ns === ns ) {

						availableExtensions.push( extension );

					}

				}

			}

			for ( let i = 0; i < availableExtensions.length; i ++ ) {

				const extension = availableExtensions[ i ];
				extension.apply( modelXml, extensions[ extension[ 'ns' ] ], meshData );

			}

		}

		function getBuild( data, objects, modelData, textureData, objectData, builder ) {

			if ( data.build !== undefined ) return data.build;

			data.build = builder( data, objects, modelData, textureData, objectData );

			return data.build;

		}

		function buildBasematerial( materialData, objects, modelData ) {

			let material;

			const displaypropertiesid = materialData.displaypropertiesid;
			const pbmetallicdisplayproperties = modelData.resources.pbmetallicdisplayproperties;

			if ( displaypropertiesid !== null && pbmetallicdisplayproperties[ displaypropertiesid ] !== undefined ) {

				// metallic display property, use StandardMaterial

				const pbmetallicdisplayproperty = pbmetallicdisplayproperties[ displaypropertiesid ];
				const metallicData = pbmetallicdisplayproperty.data[ materialData.index ];

				material = new MeshStandardMaterial( { flatShading: true, roughness: metallicData.roughness, metalness: metallicData.metallicness } );

			} else {

				// otherwise use PhongMaterial

				material = new MeshPhongMaterial( { flatShading: true } );

			}

			material.name = materialData.name;

			// displaycolor MUST be specified with a value of a 6 or 8 digit hexadecimal number, e.g. "#RRGGBB" or "#RRGGBBAA"

			const displaycolor = materialData.displaycolor;

			const color = displaycolor.substring( 0, 7 );
			material.color.setStyle( color, COLOR_SPACE_3MF );

			// process alpha if set

			if ( displaycolor.length === 9 ) {

				material.opacity = parseInt( displaycolor.charAt( 7 ) + displaycolor.charAt( 8 ), 16 ) / 255;

			}

			return material;

		}

		function buildComposite( compositeData, objects, modelData, textureData ) {

			const composite = new Group();

			for ( let j = 0; j < compositeData.length; j ++ ) {

				const component = compositeData[ j ];
				let build = objects[ component.objectId ];

				if ( build === undefined ) {

					buildObject( component.objectId, objects, modelData, textureData );
					build = objects[ component.objectId ];

				}

				const object3D = build.clone();

				// apply component transform

				const transform = component.transform;

				if ( transform ) {

					object3D.applyMatrix4( transform );

				}

				composite.add( object3D );

			}

			return composite;

		}

		function buildObject( objectId, objects, modelData, textureData ) {

			const objectData = modelData[ 'resources' ][ 'object' ][ objectId ];

			if ( objectData[ 'mesh' ] ) {

				const meshData = objectData[ 'mesh' ];

				const extensions = modelData[ 'extensions' ];
				const modelXml = modelData[ 'xml' ];

				applyExtensions( extensions, meshData, modelXml );

				objects[ objectData.id ] = getBuild( meshData, objects, modelData, textureData, objectData, buildGroup );

			} else {

				const compositeData = objectData[ 'components' ];

				objects[ objectData.id ] = getBuild( compositeData, objects, modelData, textureData, objectData, buildComposite );

			}

			if ( objectData.name ) {

				objects[ objectData.id ].name = objectData.name;

			}

			if ( modelData.resources.implicitfunction ) {

				console.warn( 'THREE.ThreeMFLoader: Implicit Functions are implemented in data-only.', modelData.resources.implicitfunction );

			}

		}

		function buildObjects( data3mf ) {

			const modelsData = data3mf.model;
			const modelRels = data3mf.modelRels;
			const objects = {};
			const modelsKeys = Object.keys( modelsData );
			const textureData = {};

			// evaluate model relationships to textures

			if ( modelRels ) {

				for ( let i = 0, l = modelRels.length; i < l; i ++ ) {

					const modelRel = modelRels[ i ];
					const textureKey = modelRel.target.substring( 1 );

					if ( data3mf.texture[ textureKey ] ) {

						textureData[ modelRel.target ] = data3mf.texture[ textureKey ];

					}

				}

			}

			// start build

			for ( let i = 0; i < modelsKeys.length; i ++ ) {

				const modelsKey = modelsKeys[ i ];
				const modelData = modelsData[ modelsKey ];

				const objectIds = Object.keys( modelData[ 'resources' ][ 'object' ] );

				for ( let j = 0; j < objectIds.length; j ++ ) {

					const objectId = objectIds[ j ];

					buildObject( objectId, objects, modelData, textureData );

				}

			}

			return objects;

		}

		function fetch3DModelPart( rels ) {

			for ( let i = 0; i < rels.length; i ++ ) {

				const rel = rels[ i ];
				const extension = rel.target.split( '.' ).pop();

				if ( extension.toLowerCase() === 'model' ) return rel;

			}

		}

		function build( objects, data3mf ) {

			const group = new Group();

			const relationship = fetch3DModelPart( data3mf[ 'rels' ] );
			const buildData = data3mf.model[ relationship[ 'target' ].substring( 1 ) ][ 'build' ];

			for ( let i = 0; i < buildData.length; i ++ ) {

				const buildItem = buildData[ i ];
				const object3D = objects[ buildItem[ 'objectId' ] ].clone();

				// apply transform

				const transform = buildItem[ 'transform' ];

				if ( transform ) {

					object3D.applyMatrix4( transform );

				}

				group.add( object3D );

			}

			return group;

		}

		const data3mf = loadDocument( data );
		const objects = buildObjects( data3mf );

		return build( objects, data3mf );

	}

	/**
	 * Adds a 3MF extension.
	 *
	 * @param {Object} extension - The extension to add.
	 */
	addExtension( extension ) {

		this.availableExtensions.push( extension );

	}

}

/**
 * The KHR_mesh_quantization extension allows these extra attribute component types
 *
 * @see https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md#extending-mesh-attributes
 */
const KHR_mesh_quantization_ExtraAttrTypes = {
	POSITION: [
		'byte',
		'byte normalized',
		'unsigned byte',
		'unsigned byte normalized',
		'short',
		'short normalized',
		'unsigned short',
		'unsigned short normalized',
	],
	NORMAL: [
		'byte normalized',
		'short normalized',
	],
	TANGENT: [
		'byte normalized',
		'short normalized',
	],
	TEXCOORD: [
		'byte',
		'byte normalized',
		'unsigned byte',
		'short',
		'short normalized',
		'unsigned short',
	],
};

/**
 * An exporter for `glTF` 2.0.
 *
 * glTF (GL Transmission Format) is an [open format specification](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0)
 * for efficient delivery and loading of 3D content. Assets may be provided either in JSON (.gltf)
 * or binary (.glb) format. External files store textures (.jpg, .png) and additional binary
 * data (.bin). A glTF asset may deliver one or more scenes, including meshes, materials,
 * textures, skins, skeletons, morph targets, animations, lights, and/or cameras.
 *
 * GLTFExporter supports the [glTF 2.0 extensions](https://github.com/KhronosGroup/glTF/tree/master/extensions/):
 *
 * - KHR_lights_punctual
 * - KHR_materials_clearcoat
 * - KHR_materials_dispersion
 * - KHR_materials_emissive_strength
 * - KHR_materials_ior
 * - KHR_materials_iridescence
 * - KHR_materials_specular
 * - KHR_materials_sheen
 * - KHR_materials_transmission
 * - KHR_materials_unlit
 * - KHR_materials_volume
 * - KHR_mesh_quantization
 * - KHR_texture_transform
 * - EXT_materials_bump
 * - EXT_mesh_gpu_instancing
 *
 * The following glTF 2.0 extension is supported by an external user plugin:
 *
 * - [KHR_materials_variants](https://github.com/takahirox/three-gltf-extensions)
 *
 * ```js
 * const exporter = new GLTFExporter();
 * const data = await exporter.parseAsync( scene, options );
 * ```
 *
 * @three_import import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
 */
class GLTFExporter {

	/**
	 * Constructs a new glTF exporter.
	 */
	constructor() {

		/**
		 * A reference to a texture utils module.
		 *
		 * @type {?(WebGLTextureUtils|WebGPUTextureUtils)}
		 * @default null
		 */
		this.textureUtils = null;

		this.pluginCallbacks = [];

		this.register( function ( writer ) {

			return new GLTFLightExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsUnlitExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsTransmissionExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsVolumeExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsIorExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsSpecularExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsClearcoatExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsDispersionExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsIridescenceExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsSheenExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsAnisotropyExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsEmissiveStrengthExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMaterialsBumpExtension( writer );

		} );

		this.register( function ( writer ) {

			return new GLTFMeshGpuInstancing( writer );

		} );

	}

	/**
	 * Registers a plugin callback. This API is internally used to implement the various
	 * glTF extensions but can also used by third-party code to add additional logic
	 * to the exporter.
	 *
	 * @param {function(writer:GLTFWriter)} callback - The callback function to register.
	 * @return {GLTFExporter} A reference to this exporter.
	 */
	register( callback ) {

		if ( this.pluginCallbacks.indexOf( callback ) === -1 ) {

			this.pluginCallbacks.push( callback );

		}

		return this;

	}

	/**
	 * Unregisters a plugin callback.
	 *
	 * @param {Function} callback - The callback function to unregister.
	 * @return {GLTFExporter} A reference to this exporter.
	 */
	unregister( callback ) {

		if ( this.pluginCallbacks.indexOf( callback ) !== -1 ) {

			this.pluginCallbacks.splice( this.pluginCallbacks.indexOf( callback ), 1 );

		}

		return this;

	}

	/**
	 * Sets the texture utils for this exporter. Only relevant when compressed textures have to be exported.
	 *
	 * Depending on whether you use {@link WebGLRenderer} or {@link WebGPURenderer}, you must inject the
	 * corresponding texture utils {@link WebGLTextureUtils} or {@link WebGPUTextureUtils}.
	 *
	 * @param {WebGLTextureUtils|WebGPUTextureUtils} utils - The texture utils.
	 * @return {GLTFExporter} A reference to this exporter.
	 */
	setTextureUtils( utils ) {

		this.textureUtils = utils;

		return this;

	}

	/**
	 * Parses the given scenes and generates the glTF output.
	 *
	 * @param {Scene|Array<Scene>} input - A scene or an array of scenes.
	 * @param {GLTFExporter~OnDone} onDone - A callback function that is executed when the export has finished.
	 * @param {GLTFExporter~OnError} onError - A callback function that is executed when an error happens.
	 * @param {GLTFExporter~Options} options - options
	 */
	parse( input, onDone, onError, options ) {

		const writer = new GLTFWriter();
		const plugins = [];

		for ( let i = 0, il = this.pluginCallbacks.length; i < il; i ++ ) {

			plugins.push( this.pluginCallbacks[ i ]( writer ) );

		}

		writer.setPlugins( plugins );
		writer.setTextureUtils( this.textureUtils );
		writer.writeAsync( input, onDone, options ).catch( onError );

	}

	/**
	 * Async version of {@link GLTFExporter#parse}.
	 *
	 * @param {Scene|Array<Scene>} input - A scene or an array of scenes.
	 * @param {GLTFExporter~Options} options - options.
	 * @return {Promise<ArrayBuffer|string>} A Promise that resolved with the exported glTF data.
	 */
	parseAsync( input, options ) {

		const scope = this;

		return new Promise( function ( resolve, reject ) {

			scope.parse( input, resolve, reject, options );

		} );

	}

}

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const WEBGL_CONSTANTS = {
	POINTS: 0x0000,
	LINES: 0x0001,
	LINE_LOOP: 0x0002,
	LINE_STRIP: 0x0003,
	TRIANGLES: 0x0004,
	BYTE: 0x1400,
	UNSIGNED_BYTE: 0x1401,
	SHORT: 0x1402,
	UNSIGNED_SHORT: 0x1403,
	INT: 0x1404,
	UNSIGNED_INT: 0x1405,
	FLOAT: 0x1406,

	ARRAY_BUFFER: 0x8892,
	ELEMENT_ARRAY_BUFFER: 0x8893,

	NEAREST: 0x2600,
	LINEAR: 0x2601,
	NEAREST_MIPMAP_NEAREST: 0x2700,
	LINEAR_MIPMAP_NEAREST: 0x2701,
	NEAREST_MIPMAP_LINEAR: 0x2702,
	LINEAR_MIPMAP_LINEAR: 0x2703,

	CLAMP_TO_EDGE: 33071,
	MIRRORED_REPEAT: 33648,
	REPEAT: 10497
};

const KHR_MESH_QUANTIZATION = 'KHR_mesh_quantization';

const THREE_TO_WEBGL = {};

THREE_TO_WEBGL[ NearestFilter ] = WEBGL_CONSTANTS.NEAREST;
THREE_TO_WEBGL[ NearestMipmapNearestFilter ] = WEBGL_CONSTANTS.NEAREST_MIPMAP_NEAREST;
THREE_TO_WEBGL[ NearestMipmapLinearFilter ] = WEBGL_CONSTANTS.NEAREST_MIPMAP_LINEAR;
THREE_TO_WEBGL[ LinearFilter ] = WEBGL_CONSTANTS.LINEAR;
THREE_TO_WEBGL[ LinearMipmapNearestFilter ] = WEBGL_CONSTANTS.LINEAR_MIPMAP_NEAREST;
THREE_TO_WEBGL[ LinearMipmapLinearFilter ] = WEBGL_CONSTANTS.LINEAR_MIPMAP_LINEAR;

THREE_TO_WEBGL[ ClampToEdgeWrapping ] = WEBGL_CONSTANTS.CLAMP_TO_EDGE;
THREE_TO_WEBGL[ RepeatWrapping ] = WEBGL_CONSTANTS.REPEAT;
THREE_TO_WEBGL[ MirroredRepeatWrapping ] = WEBGL_CONSTANTS.MIRRORED_REPEAT;

const PATH_PROPERTIES = {
	scale: 'scale',
	position: 'translation',
	quaternion: 'rotation',
	morphTargetInfluences: 'weights'
};

const DEFAULT_SPECULAR_COLOR = new Color();

// GLB constants
// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#glb-file-format-specification

const GLB_HEADER_BYTES = 12;
const GLB_HEADER_MAGIC = 0x46546C67;
const GLB_VERSION = 2;

const GLB_CHUNK_PREFIX_BYTES = 8;
const GLB_CHUNK_TYPE_JSON = 0x4E4F534A;
const GLB_CHUNK_TYPE_BIN = 0x004E4942;

//------------------------------------------------------------------------------
// Utility functions
//------------------------------------------------------------------------------

/**
 * Compare two arrays
 *
 * @private
 * @param {Array} array1 Array 1 to compare
 * @param {Array} array2 Array 2 to compare
 * @return {boolean}        Returns true if both arrays are equal
 */
function equalArray( array1, array2 ) {

	return ( array1.length === array2.length ) && array1.every( function ( element, index ) {

		return element === array2[ index ];

	} );

}

/**
 * Converts a string to an ArrayBuffer.
 *
 * @private
 * @param {string} text
 * @return {ArrayBuffer}
 */
function stringToArrayBuffer( text ) {

	return new TextEncoder().encode( text ).buffer;

}

/**
 * Is identity matrix
 *
 * @private
 * @param {Matrix4} matrix
 * @returns {boolean} Returns true, if parameter is identity matrix
 */
function isIdentityMatrix( matrix ) {

	return equalArray( matrix.elements, [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 ] );

}

/**
 * Get the min and max vectors from the given attribute
 *
 * @private
 * @param {BufferAttribute} attribute Attribute to find the min/max in range from start to start + count
 * @param {number} start Start index
 * @param {number} count Range to cover
 * @return {Object} Object containing the `min` and `max` values (As an array of attribute.itemSize components)
 */
function getMinMax( attribute, start, count ) {

	const output = {

		min: new Array( attribute.itemSize ).fill( Number.POSITIVE_INFINITY ),
		max: new Array( attribute.itemSize ).fill( Number.NEGATIVE_INFINITY )

	};

	for ( let i = start; i < start + count; i ++ ) {

		for ( let a = 0; a < attribute.itemSize; a ++ ) {

			let value;

			if ( attribute.itemSize > 4 ) {

				 // no support for interleaved data for itemSize > 4

				value = attribute.array[ i * attribute.itemSize + a ];

			} else {

				if ( a === 0 ) value = attribute.getX( i );
				else if ( a === 1 ) value = attribute.getY( i );
				else if ( a === 2 ) value = attribute.getZ( i );
				else if ( a === 3 ) value = attribute.getW( i );

				if ( attribute.normalized === true ) {

					value = MathUtils.normalize( value, attribute.array );

				}

			}

			output.min[ a ] = Math.min( output.min[ a ], value );
			output.max[ a ] = Math.max( output.max[ a ], value );

		}

	}

	return output;

}

/**
 * Get the required size + padding for a buffer, rounded to the next 4-byte boundary.
 * https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#data-alignment
 *
 * @private
 * @param {number} bufferSize The size the original buffer. Should be an integer.
 * @returns {number} new buffer size with required padding as an integer.
 *
 */
function getPaddedBufferSize( bufferSize ) {

	return Math.ceil( bufferSize / 4 ) * 4;

}

/**
 * Returns a buffer aligned to 4-byte boundary.
 *
 * @private
 * @param {ArrayBuffer} arrayBuffer Buffer to pad
 * @param {number} [paddingByte=0] Should be an integer
 * @returns {ArrayBuffer} The same buffer if it's already aligned to 4-byte boundary or a new buffer
 */
function getPaddedArrayBuffer( arrayBuffer, paddingByte = 0 ) {

	const paddedLength = getPaddedBufferSize( arrayBuffer.byteLength );

	if ( paddedLength !== arrayBuffer.byteLength ) {

		const array = new Uint8Array( paddedLength );
		array.set( new Uint8Array( arrayBuffer ) );

		if ( paddingByte !== 0 ) {

			for ( let i = arrayBuffer.byteLength; i < paddedLength; i ++ ) {

				array[ i ] = paddingByte;

			}

		}

		return array.buffer;

	}

	return arrayBuffer;

}

function getCanvas() {

	if ( typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined' ) {

		return new OffscreenCanvas( 1, 1 );

	}

	return document.createElement( 'canvas' );

}

function getToBlobPromise( canvas, mimeType ) {

	if ( typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas ) {

		let quality;

		// Blink's implementation of convertToBlob seems to default to a quality level of 100%
		// Use the Blink default quality levels of toBlob instead so that file sizes are comparable.
		if ( mimeType === 'image/jpeg' ) {

			quality = 0.92;

		} else if ( mimeType === 'image/webp' ) {

			quality = 0.8;

		}

		return canvas.convertToBlob( {

			type: mimeType,
			quality: quality

		} );

	} else {

		// HTMLCanvasElement code path

		return new Promise( ( resolve ) => canvas.toBlob( resolve, mimeType ) );

	}

}

/**
 * Writer
 *
 * @private
 */
class GLTFWriter {

	constructor() {

		this.plugins = [];

		this.options = {};
		this.pending = [];
		this.buffers = [];

		this.byteOffset = 0;
		this.buffers = [];
		this.nodeMap = new Map();
		this.skins = [];

		this.extensionsUsed = {};
		this.extensionsRequired = {};

		this.uids = new Map();
		this.uid = 0;

		this.json = {
			asset: {
				version: '2.0',
				generator: 'THREE.GLTFExporter r' + REVISION
			}
		};

		this.cache = {
			meshes: new Map(),
			attributes: new Map(),
			attributesNormalized: new Map(),
			materials: new Map(),
			textures: new Map(),
			images: new Map()
		};

		this.textureUtils = null;

	}

	setPlugins( plugins ) {

		this.plugins = plugins;

	}

	setTextureUtils( utils ) {

		this.textureUtils = utils;

	}

	/**
	 * Parse scenes and generate GLTF output
	 *
	 * @param {Scene|Array<Scene>} input Scene or Array of THREE.Scenes
	 * @param {Function} onDone Callback on completed
	 * @param {Object} options options
	 */
	async writeAsync( input, onDone, options = {} ) {

		this.options = Object.assign( {
			// default options
			binary: false,
			trs: false,
			onlyVisible: true,
			maxTextureSize: Infinity,
			animations: [],
			includeCustomExtensions: false
		}, options );

		if ( this.options.animations.length > 0 ) {

			// Only TRS properties, and not matrices, may be targeted by animation.
			this.options.trs = true;

		}

		await this.processInputAsync( input );

		await Promise.all( this.pending );

		const writer = this;
		const buffers = writer.buffers;
		const json = writer.json;
		options = writer.options;

		const extensionsUsed = writer.extensionsUsed;
		const extensionsRequired = writer.extensionsRequired;

		// Merge buffers.
		const blob = new Blob( buffers, { type: 'application/octet-stream' } );

		// Declare extensions.
		const extensionsUsedList = Object.keys( extensionsUsed );
		const extensionsRequiredList = Object.keys( extensionsRequired );

		if ( extensionsUsedList.length > 0 ) json.extensionsUsed = extensionsUsedList;
		if ( extensionsRequiredList.length > 0 ) json.extensionsRequired = extensionsRequiredList;

		// Update bytelength of the single buffer.
		if ( json.buffers && json.buffers.length > 0 ) json.buffers[ 0 ].byteLength = blob.size;

		if ( options.binary === true ) {

			// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#glb-file-format-specification

			const reader = new FileReader();
			reader.readAsArrayBuffer( blob );
			reader.onloadend = function () {

				// Binary chunk.
				const binaryChunk = getPaddedArrayBuffer( reader.result );
				const binaryChunkPrefix = new DataView( new ArrayBuffer( GLB_CHUNK_PREFIX_BYTES ) );
				binaryChunkPrefix.setUint32( 0, binaryChunk.byteLength, true );
				binaryChunkPrefix.setUint32( 4, GLB_CHUNK_TYPE_BIN, true );

				// JSON chunk.
				const jsonChunk = getPaddedArrayBuffer( stringToArrayBuffer( JSON.stringify( json ) ), 0x20 );
				const jsonChunkPrefix = new DataView( new ArrayBuffer( GLB_CHUNK_PREFIX_BYTES ) );
				jsonChunkPrefix.setUint32( 0, jsonChunk.byteLength, true );
				jsonChunkPrefix.setUint32( 4, GLB_CHUNK_TYPE_JSON, true );

				// GLB header.
				const header = new ArrayBuffer( GLB_HEADER_BYTES );
				const headerView = new DataView( header );
				headerView.setUint32( 0, GLB_HEADER_MAGIC, true );
				headerView.setUint32( 4, GLB_VERSION, true );
				const totalByteLength = GLB_HEADER_BYTES
					+ jsonChunkPrefix.byteLength + jsonChunk.byteLength
					+ binaryChunkPrefix.byteLength + binaryChunk.byteLength;
				headerView.setUint32( 8, totalByteLength, true );

				const glbBlob = new Blob( [
					header,
					jsonChunkPrefix,
					jsonChunk,
					binaryChunkPrefix,
					binaryChunk
				], { type: 'application/octet-stream' } );

				const glbReader = new FileReader();
				glbReader.readAsArrayBuffer( glbBlob );
				glbReader.onloadend = function () {

					onDone( glbReader.result );

				};

			};

		} else {

			if ( json.buffers && json.buffers.length > 0 ) {

				const reader = new FileReader();
				reader.readAsDataURL( blob );
				reader.onloadend = function () {

					const base64data = reader.result;
					json.buffers[ 0 ].uri = base64data;
					onDone( json );

				};

			} else {

				onDone( json );

			}

		}


	}

	/**
	 * Serializes a userData.
	 *
	 * @param {THREE.Object3D|THREE.Material|THREE.BufferGeometry|THREE.AnimationClip} object
	 * @param {Object} objectDef
	 */
	serializeUserData( object, objectDef ) {

		if ( Object.keys( object.userData ).length === 0 ) return;

		const options = this.options;
		const extensionsUsed = this.extensionsUsed;

		try {

			const json = JSON.parse( JSON.stringify( object.userData ) );

			if ( options.includeCustomExtensions && json.gltfExtensions ) {

				if ( objectDef.extensions === undefined ) objectDef.extensions = {};

				for ( const extensionName in json.gltfExtensions ) {

					objectDef.extensions[ extensionName ] = json.gltfExtensions[ extensionName ];
					extensionsUsed[ extensionName ] = true;

				}

				delete json.gltfExtensions;

			}

			if ( Object.keys( json ).length > 0 ) objectDef.extras = json;

		} catch ( error ) {

			console.warn( 'THREE.GLTFExporter: userData of \'' + object.name + '\' ' +
				'won\'t be serialized because of JSON.stringify error - ' + error.message );

		}

	}

	/**
	 * Returns ids for buffer attributes.
	 *
	 * @param {Object} attribute
	 * @param {boolean} [isRelativeCopy=false]
	 * @return {number} An integer
	 */
	getUID( attribute, isRelativeCopy = false ) {

		if ( this.uids.has( attribute ) === false ) {

			const uids = new Map();

			uids.set( true, this.uid ++ );
			uids.set( false, this.uid ++ );

			this.uids.set( attribute, uids );

		}

		const uids = this.uids.get( attribute );

		return uids.get( isRelativeCopy );

	}

	/**
	 * Checks if normal attribute values are normalized.
	 *
	 * @param {BufferAttribute} normal
	 * @returns {boolean}
	 */
	isNormalizedNormalAttribute( normal ) {

		const cache = this.cache;

		if ( cache.attributesNormalized.has( normal ) ) return false;

		const v = new Vector3();

		for ( let i = 0, il = normal.count; i < il; i ++ ) {

			// 0.0005 is from glTF-validator
			if ( Math.abs( v.fromBufferAttribute( normal, i ).length() - 1.0 ) > 0.0005 ) return false;

		}

		return true;

	}

	/**
	 * Creates normalized normal buffer attribute.
	 *
	 * @param {BufferAttribute} normal
	 * @returns {BufferAttribute}
	 *
	 */
	createNormalizedNormalAttribute( normal ) {

		const cache = this.cache;

		if ( cache.attributesNormalized.has( normal ) )	return cache.attributesNormalized.get( normal );

		const attribute = normal.clone();
		const v = new Vector3();

		for ( let i = 0, il = attribute.count; i < il; i ++ ) {

			v.fromBufferAttribute( attribute, i );

			if ( v.x === 0 && v.y === 0 && v.z === 0 ) {

				// if values can't be normalized set (1, 0, 0)
				v.setX( 1.0 );

			} else {

				v.normalize();

			}

			attribute.setXYZ( i, v.x, v.y, v.z );

		}

		cache.attributesNormalized.set( normal, attribute );

		return attribute;

	}

	/**
	 * Applies a texture transform, if present, to the map definition. Requires
	 * the KHR_texture_transform extension.
	 *
	 * @param {Object} mapDef
	 * @param {THREE.Texture} texture
	 */
	applyTextureTransform( mapDef, texture ) {

		let didTransform = false;
		const transformDef = {};

		if ( texture.offset.x !== 0 || texture.offset.y !== 0 ) {

			transformDef.offset = texture.offset.toArray();
			didTransform = true;

		}

		if ( texture.rotation !== 0 ) {

			transformDef.rotation = texture.rotation;
			didTransform = true;

		}

		if ( texture.repeat.x !== 1 || texture.repeat.y !== 1 ) {

			transformDef.scale = texture.repeat.toArray();
			didTransform = true;

		}

		if ( didTransform ) {

			mapDef.extensions = mapDef.extensions || {};
			mapDef.extensions[ 'KHR_texture_transform' ] = transformDef;
			this.extensionsUsed[ 'KHR_texture_transform' ] = true;

		}

	}

	async buildMetalRoughTextureAsync( metalnessMap, roughnessMap ) {

		if ( metalnessMap === roughnessMap ) return metalnessMap;

		function getEncodingConversion( map ) {

			if ( map.colorSpace === SRGBColorSpace ) {

				return function SRGBToLinear( c ) {

					return ( c < 0.04045 ) ? c * 0.0773993808 : Math.pow( c * 0.9478672986 + 0.0521327014, 2.4 );

				};

			}

			return function LinearToLinear( c ) {

				return c;

			};

		}

		if ( metalnessMap instanceof CompressedTexture ) {

			metalnessMap = await this.decompressTextureAsync( metalnessMap );

		}

		if ( roughnessMap instanceof CompressedTexture ) {

			roughnessMap = await this.decompressTextureAsync( roughnessMap );

		}

		const metalness = metalnessMap ? metalnessMap.image : null;
		const roughness = roughnessMap ? roughnessMap.image : null;

		const width = Math.max( metalness ? metalness.width : 0, roughness ? roughness.width : 0 );
		const height = Math.max( metalness ? metalness.height : 0, roughness ? roughness.height : 0 );

		const canvas = getCanvas();
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext( '2d', {
			willReadFrequently: true,
		} );
		context.fillStyle = '#00ffff';
		context.fillRect( 0, 0, width, height );

		const composite = context.getImageData( 0, 0, width, height );

		if ( metalness ) {

			context.drawImage( metalness, 0, 0, width, height );

			const convert = getEncodingConversion( metalnessMap );
			const data = context.getImageData( 0, 0, width, height ).data;

			for ( let i = 2; i < data.length; i += 4 ) {

				composite.data[ i ] = convert( data[ i ] / 256 ) * 256;

			}

		}

		if ( roughness ) {

			context.drawImage( roughness, 0, 0, width, height );

			const convert = getEncodingConversion( roughnessMap );
			const data = context.getImageData( 0, 0, width, height ).data;

			for ( let i = 1; i < data.length; i += 4 ) {

				composite.data[ i ] = convert( data[ i ] / 256 ) * 256;

			}

		}

		context.putImageData( composite, 0, 0 );

		//

		const reference = metalnessMap || roughnessMap;

		const texture = reference.clone();

		texture.source = new Source( canvas );
		texture.colorSpace = NoColorSpace;
		texture.channel = ( metalnessMap || roughnessMap ).channel;

		if ( metalnessMap && roughnessMap && metalnessMap.channel !== roughnessMap.channel ) {

			console.warn( 'THREE.GLTFExporter: UV channels for metalnessMap and roughnessMap textures must match.' );

		}

		console.warn( 'THREE.GLTFExporter: Merged metalnessMap and roughnessMap textures.' );

		return texture;

	}


	async decompressTextureAsync( texture, maxTextureSize = Infinity ) {

		if ( this.textureUtils === null ) {

			throw new Error( 'THREE.GLTFExporter: setTextureUtils() must be called to process compressed textures.' );

		}

		return await this.textureUtils.decompress( texture, maxTextureSize );

	}

	/**
	 * Process a buffer to append to the default one.
	 * @param {ArrayBuffer} buffer
	 * @return {0}
	 */
	processBuffer( buffer ) {

		const json = this.json;
		const buffers = this.buffers;

		if ( ! json.buffers ) json.buffers = [ { byteLength: 0 } ];

		// All buffers are merged before export.
		buffers.push( buffer );

		return 0;

	}

	/**
	 * Process and generate a BufferView
	 * @param {BufferAttribute} attribute
	 * @param {number} componentType
	 * @param {number} start
	 * @param {number} count
	 * @param {number} [target] Target usage of the BufferView
	 * @return {Object}
	 */
	processBufferView( attribute, componentType, start, count, target ) {

		const json = this.json;

		if ( ! json.bufferViews ) json.bufferViews = [];

		// Create a new dataview and dump the attribute's array into it

		let componentSize;

		switch ( componentType ) {

			case WEBGL_CONSTANTS.BYTE:
			case WEBGL_CONSTANTS.UNSIGNED_BYTE:

				componentSize = 1;

				break;

			case WEBGL_CONSTANTS.SHORT:
			case WEBGL_CONSTANTS.UNSIGNED_SHORT:

				componentSize = 2;

				break;

			default:

				componentSize = 4;

		}

		let byteStride = attribute.itemSize * componentSize;

		if ( target === WEBGL_CONSTANTS.ARRAY_BUFFER ) {

			// Each element of a vertex attribute MUST be aligned to 4-byte boundaries
			// inside a bufferView
			byteStride = Math.ceil( byteStride / 4 ) * 4;

		}

		const byteLength = getPaddedBufferSize( count * byteStride );
		const dataView = new DataView( new ArrayBuffer( byteLength ) );
		let offset = 0;

		for ( let i = start; i < start + count; i ++ ) {

			for ( let a = 0; a < attribute.itemSize; a ++ ) {

				let value;

				if ( attribute.itemSize > 4 ) {

					 // no support for interleaved data for itemSize > 4

					value = attribute.array[ i * attribute.itemSize + a ];

				} else {

					if ( a === 0 ) value = attribute.getX( i );
					else if ( a === 1 ) value = attribute.getY( i );
					else if ( a === 2 ) value = attribute.getZ( i );
					else if ( a === 3 ) value = attribute.getW( i );

					if ( attribute.normalized === true ) {

						value = MathUtils.normalize( value, attribute.array );

					}

				}

				if ( componentType === WEBGL_CONSTANTS.FLOAT ) {

					dataView.setFloat32( offset, value, true );

				} else if ( componentType === WEBGL_CONSTANTS.INT ) {

					dataView.setInt32( offset, value, true );

				} else if ( componentType === WEBGL_CONSTANTS.UNSIGNED_INT ) {

					dataView.setUint32( offset, value, true );

				} else if ( componentType === WEBGL_CONSTANTS.SHORT ) {

					dataView.setInt16( offset, value, true );

				} else if ( componentType === WEBGL_CONSTANTS.UNSIGNED_SHORT ) {

					dataView.setUint16( offset, value, true );

				} else if ( componentType === WEBGL_CONSTANTS.BYTE ) {

					dataView.setInt8( offset, value );

				} else if ( componentType === WEBGL_CONSTANTS.UNSIGNED_BYTE ) {

					dataView.setUint8( offset, value );

				}

				offset += componentSize;

			}

			if ( ( offset % byteStride ) !== 0 ) {

				offset += byteStride - ( offset % byteStride );

			}

		}

		const bufferViewDef = {

			buffer: this.processBuffer( dataView.buffer ),
			byteOffset: this.byteOffset,
			byteLength: byteLength

		};

		if ( target !== undefined ) bufferViewDef.target = target;

		if ( target === WEBGL_CONSTANTS.ARRAY_BUFFER ) {

			// Only define byteStride for vertex attributes.
			bufferViewDef.byteStride = byteStride;

		}

		this.byteOffset += byteLength;

		json.bufferViews.push( bufferViewDef );

		// @TODO Merge bufferViews where possible.
		const output = {

			id: json.bufferViews.length - 1,
			byteLength: 0

		};

		return output;

	}

	/**
	 * Process and generate a BufferView from an image Blob.
	 * @param {Blob} blob
	 * @return {Promise<number>} An integer
	 */
	processBufferViewImage( blob ) {

		const writer = this;
		const json = writer.json;

		if ( ! json.bufferViews ) json.bufferViews = [];

		return new Promise( function ( resolve ) {

			const reader = new FileReader();
			reader.readAsArrayBuffer( blob );
			reader.onloadend = function () {

				const buffer = getPaddedArrayBuffer( reader.result );

				const bufferViewDef = {
					buffer: writer.processBuffer( buffer ),
					byteOffset: writer.byteOffset,
					byteLength: buffer.byteLength
				};

				writer.byteOffset += buffer.byteLength;
				resolve( json.bufferViews.push( bufferViewDef ) - 1 );

			};

		} );

	}

	/**
	 * Process attribute to generate an accessor
	 * @param {BufferAttribute} attribute Attribute to process
	 * @param {?BufferGeometry} [geometry] Geometry used for truncated draw range
	 * @param {number} [start=0]
	 * @param {number} [count=Infinity]
	 * @return {?number} Index of the processed accessor on the "accessors" array
	 */
	processAccessor( attribute, geometry, start, count ) {

		const json = this.json;

		const types = {

			1: 'SCALAR',
			2: 'VEC2',
			3: 'VEC3',
			4: 'VEC4',
			9: 'MAT3',
			16: 'MAT4'

		};

		let componentType;

		// Detect the component type of the attribute array
		if ( attribute.array.constructor === Float32Array ) {

			componentType = WEBGL_CONSTANTS.FLOAT;

		} else if ( attribute.array.constructor === Int32Array ) {

			componentType = WEBGL_CONSTANTS.INT;

		} else if ( attribute.array.constructor === Uint32Array ) {

			componentType = WEBGL_CONSTANTS.UNSIGNED_INT;

		} else if ( attribute.array.constructor === Int16Array ) {

			componentType = WEBGL_CONSTANTS.SHORT;

		} else if ( attribute.array.constructor === Uint16Array ) {

			componentType = WEBGL_CONSTANTS.UNSIGNED_SHORT;

		} else if ( attribute.array.constructor === Int8Array ) {

			componentType = WEBGL_CONSTANTS.BYTE;

		} else if ( attribute.array.constructor === Uint8Array ) {

			componentType = WEBGL_CONSTANTS.UNSIGNED_BYTE;

		} else {

			throw new Error( 'THREE.GLTFExporter: Unsupported bufferAttribute component type: ' + attribute.array.constructor.name );

		}

		if ( start === undefined ) start = 0;
		if ( count === undefined || count === Infinity ) count = attribute.count;

		// Skip creating an accessor if the attribute doesn't have data to export
		if ( count === 0 ) return null;

		const minMax = getMinMax( attribute, start, count );
		let bufferViewTarget;

		// If geometry isn't provided, don't infer the target usage of the bufferView. For
		// animation samplers, target must not be set.
		if ( geometry !== undefined ) {

			bufferViewTarget = attribute === geometry.index ? WEBGL_CONSTANTS.ELEMENT_ARRAY_BUFFER : WEBGL_CONSTANTS.ARRAY_BUFFER;

		}

		const bufferView = this.processBufferView( attribute, componentType, start, count, bufferViewTarget );

		const accessorDef = {

			bufferView: bufferView.id,
			byteOffset: bufferView.byteOffset,
			componentType: componentType,
			count: count,
			max: minMax.max,
			min: minMax.min,
			type: types[ attribute.itemSize ]

		};

		if ( attribute.normalized === true ) accessorDef.normalized = true;
		if ( ! json.accessors ) json.accessors = [];

		return json.accessors.push( accessorDef ) - 1;

	}

	/**
	 * Process image
	 * @param {Image} image to process
	 * @param {number} format Identifier of the format (RGBAFormat)
	 * @param {boolean} flipY before writing out the image
	 * @param {string} mimeType export format
	 * @return {number}     Index of the processed texture in the "images" array
	 */
	processImage( image, format, flipY, mimeType = 'image/png' ) {

		if ( image !== null ) {

			const writer = this;
			const cache = writer.cache;
			const json = writer.json;
			const options = writer.options;
			const pending = writer.pending;

			if ( ! cache.images.has( image ) ) cache.images.set( image, {} );

			const cachedImages = cache.images.get( image );

			const key = mimeType + ':flipY/' + flipY.toString();

			if ( cachedImages[ key ] !== undefined ) return cachedImages[ key ];

			if ( ! json.images ) json.images = [];

			const imageDef = { mimeType: mimeType };

			const canvas = getCanvas();

			canvas.width = Math.min( image.width, options.maxTextureSize );
			canvas.height = Math.min( image.height, options.maxTextureSize );

			const ctx = canvas.getContext( '2d', {
				willReadFrequently: true,
			} );

			if ( flipY === true ) {

				ctx.translate( 0, canvas.height );
				ctx.scale( 1, -1 );

			}

			if ( image.data !== undefined ) { // THREE.DataTexture

				if ( format !== RGBAFormat ) {

					console.error( 'GLTFExporter: Only RGBAFormat is supported.', format );

				}

				if ( image.width > options.maxTextureSize || image.height > options.maxTextureSize ) {

					console.warn( 'GLTFExporter: Image size is bigger than maxTextureSize', image );

				}

				const data = new Uint8ClampedArray( image.height * image.width * 4 );

				for ( let i = 0; i < data.length; i += 4 ) {

					data[ i + 0 ] = image.data[ i + 0 ];
					data[ i + 1 ] = image.data[ i + 1 ];
					data[ i + 2 ] = image.data[ i + 2 ];
					data[ i + 3 ] = image.data[ i + 3 ];

				}

				ctx.putImageData( new ImageData( data, image.width, image.height ), 0, 0 );

			} else {

				if ( ( typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement ) ||
					( typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement ) ||
					( typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap ) ||
					( typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas ) ) {

					ctx.drawImage( image, 0, 0, canvas.width, canvas.height );

				} else {

					throw new Error( 'THREE.GLTFExporter: Invalid image type. Use HTMLImageElement, HTMLCanvasElement, ImageBitmap or OffscreenCanvas.' );

				}

			}

			if ( options.binary === true ) {

				pending.push(

					getToBlobPromise( canvas, mimeType )
						.then( blob => writer.processBufferViewImage( blob ) )
						.then( bufferViewIndex => {

							imageDef.bufferView = bufferViewIndex;

						} )

				);

			} else {

				imageDef.uri = ImageUtils.getDataURL( canvas, mimeType );

			}

			const index = json.images.push( imageDef ) - 1;
			cachedImages[ key ] = index;
			return index;

		} else {

			throw new Error( 'THREE.GLTFExporter: No valid image data found. Unable to process texture.' );

		}

	}

	/**
	 * Process sampler
	 * @param {Texture} map Texture to process
	 * @return {number}      Index of the processed texture in the "samplers" array
	 */
	processSampler( map ) {

		const json = this.json;

		if ( ! json.samplers ) json.samplers = [];

		const samplerDef = {
			magFilter: THREE_TO_WEBGL[ map.magFilter ],
			minFilter: THREE_TO_WEBGL[ map.minFilter ],
			wrapS: THREE_TO_WEBGL[ map.wrapS ],
			wrapT: THREE_TO_WEBGL[ map.wrapT ]
		};

		return json.samplers.push( samplerDef ) - 1;

	}

	/**
	 * Process texture
	 * @param {Texture} map Map to process
	 * @return {Promise<number>} Index of the processed texture in the "textures" array
	 */
	async processTextureAsync( map ) {

		const writer = this;
		const options = writer.options;
		const cache = this.cache;
		const json = this.json;

		if ( cache.textures.has( map ) ) return cache.textures.get( map );

		if ( ! json.textures ) json.textures = [];

		// make non-readable textures (e.g. CompressedTexture) readable by blitting them into a new texture
		if ( map instanceof CompressedTexture ) {

			map = await this.decompressTextureAsync( map, options.maxTextureSize );

		}

		let mimeType = map.userData.mimeType;

		if ( mimeType === 'image/webp' ) mimeType = 'image/png';

		const textureDef = {
			sampler: this.processSampler( map ),
			source: this.processImage( map.image, map.format, map.flipY, mimeType )
		};

		if ( map.name ) textureDef.name = map.name;

		await this._invokeAllAsync( async function ( ext ) {

			ext.writeTexture && await ext.writeTexture( map, textureDef );

		} );

		const index = json.textures.push( textureDef ) - 1;
		cache.textures.set( map, index );
		return index;

	}

	/**
	 * Process material
	 * @param {THREE.Material} material Material to process
	 * @return {Promise<?number>} Index of the processed material in the "materials" array
	 */
	async processMaterialAsync( material ) {

		const cache = this.cache;
		const json = this.json;

		if ( cache.materials.has( material ) ) return cache.materials.get( material );

		if ( material.isShaderMaterial ) {

			console.warn( 'GLTFExporter: THREE.ShaderMaterial not supported.' );
			return null;

		}

		if ( ! json.materials ) json.materials = [];

		// @QUESTION Should we avoid including any attribute that has the default value?
		const materialDef = {	pbrMetallicRoughness: {} };

		if ( material.isMeshStandardMaterial !== true && material.isMeshBasicMaterial !== true ) {

			console.warn( 'GLTFExporter: Use MeshStandardMaterial or MeshBasicMaterial for best results.' );

		}

		// pbrMetallicRoughness.baseColorFactor
		const color = material.color.toArray().concat( [ material.opacity ] );

		if ( ! equalArray( color, [ 1, 1, 1, 1 ] ) ) {

			materialDef.pbrMetallicRoughness.baseColorFactor = color;

		}

		if ( material.isMeshStandardMaterial ) {

			materialDef.pbrMetallicRoughness.metallicFactor = material.metalness;
			materialDef.pbrMetallicRoughness.roughnessFactor = material.roughness;

		} else {

			materialDef.pbrMetallicRoughness.metallicFactor = 0;
			materialDef.pbrMetallicRoughness.roughnessFactor = 1;

		}

		// pbrMetallicRoughness.metallicRoughnessTexture
		if ( material.metalnessMap || material.roughnessMap ) {

			const metalRoughTexture = await this.buildMetalRoughTextureAsync( material.metalnessMap, material.roughnessMap );

			const metalRoughMapDef = {
				index: await this.processTextureAsync( metalRoughTexture ),
				texCoord: metalRoughTexture.channel
			};
			this.applyTextureTransform( metalRoughMapDef, metalRoughTexture );
			materialDef.pbrMetallicRoughness.metallicRoughnessTexture = metalRoughMapDef;

		}

		// pbrMetallicRoughness.baseColorTexture
		if ( material.map ) {

			const baseColorMapDef = {
				index: await this.processTextureAsync( material.map ),
				texCoord: material.map.channel
			};
			this.applyTextureTransform( baseColorMapDef, material.map );
			materialDef.pbrMetallicRoughness.baseColorTexture = baseColorMapDef;

		}

		if ( material.emissive ) {

			const emissive = material.emissive;
			const maxEmissiveComponent = Math.max( emissive.r, emissive.g, emissive.b );

			if ( maxEmissiveComponent > 0 ) {

				materialDef.emissiveFactor = material.emissive.toArray();

			}

			// emissiveTexture
			if ( material.emissiveMap ) {

				const emissiveMapDef = {
					index: await this.processTextureAsync( material.emissiveMap ),
					texCoord: material.emissiveMap.channel
				};
				this.applyTextureTransform( emissiveMapDef, material.emissiveMap );
				materialDef.emissiveTexture = emissiveMapDef;

			}

		}

		// normalTexture
		if ( material.normalMap ) {

			const normalMapDef = {
				index: await this.processTextureAsync( material.normalMap ),
				texCoord: material.normalMap.channel
			};

			if ( material.normalScale && material.normalScale.x !== 1 ) {

				// glTF normal scale is univariate. Ignore `y`, which may be flipped.
				// Context: https://github.com/mrdoob/three.js/issues/11438#issuecomment-507003995
				normalMapDef.scale = material.normalScale.x;

			}

			this.applyTextureTransform( normalMapDef, material.normalMap );
			materialDef.normalTexture = normalMapDef;

		}

		// occlusionTexture
		if ( material.aoMap ) {

			const occlusionMapDef = {
				index: await this.processTextureAsync( material.aoMap ),
				texCoord: material.aoMap.channel
			};

			if ( material.aoMapIntensity !== 1.0 ) {

				occlusionMapDef.strength = material.aoMapIntensity;

			}

			this.applyTextureTransform( occlusionMapDef, material.aoMap );
			materialDef.occlusionTexture = occlusionMapDef;

		}

		// alphaMode
		if ( material.transparent ) {

			materialDef.alphaMode = 'BLEND';

		} else {

			if ( material.alphaTest > 0.0 ) {

				materialDef.alphaMode = 'MASK';
				materialDef.alphaCutoff = material.alphaTest;

			}

		}

		// doubleSided
		if ( material.side === DoubleSide ) materialDef.doubleSided = true;
		if ( material.name !== '' ) materialDef.name = material.name;

		this.serializeUserData( material, materialDef );

		await this._invokeAllAsync( async function ( ext ) {

			ext.writeMaterialAsync && await ext.writeMaterialAsync( material, materialDef );

		} );

		const index = json.materials.push( materialDef ) - 1;
		cache.materials.set( material, index );
		return index;

	}

	/**
	 * Process mesh
	 * @param {THREE.Mesh} mesh Mesh to process
	 * @return {Promise<?number>} Index of the processed mesh in the "meshes" array
	 */
	async processMeshAsync( mesh ) {

		const cache = this.cache;
		const json = this.json;

		const meshCacheKeyParts = [ mesh.geometry.uuid ];

		if ( Array.isArray( mesh.material ) ) {

			for ( let i = 0, l = mesh.material.length; i < l; i ++ ) {

				meshCacheKeyParts.push( mesh.material[ i ].uuid	);

			}

		} else {

			meshCacheKeyParts.push( mesh.material.uuid );

		}

		const meshCacheKey = meshCacheKeyParts.join( ':' );

		if ( cache.meshes.has( meshCacheKey ) ) return cache.meshes.get( meshCacheKey );

		const geometry = mesh.geometry;

		let mode;

		// Use the correct mode
		if ( mesh.isLineSegments ) {

			mode = WEBGL_CONSTANTS.LINES;

		} else if ( mesh.isLineLoop ) {

			mode = WEBGL_CONSTANTS.LINE_LOOP;

		} else if ( mesh.isLine ) {

			mode = WEBGL_CONSTANTS.LINE_STRIP;

		} else if ( mesh.isPoints ) {

			mode = WEBGL_CONSTANTS.POINTS;

		} else {

			mode = mesh.material.wireframe ? WEBGL_CONSTANTS.LINES : WEBGL_CONSTANTS.TRIANGLES;

		}

		const meshDef = {};
		const attributes = {};
		const primitives = [];
		const targets = [];

		// Conversion between attributes names in threejs and gltf spec
		const nameConversion = {
			uv: 'TEXCOORD_0',
			uv1: 'TEXCOORD_1',
			uv2: 'TEXCOORD_2',
			uv3: 'TEXCOORD_3',
			color: 'COLOR_0',
			skinWeight: 'WEIGHTS_0',
			skinIndex: 'JOINTS_0'
		};

		const originalNormal = geometry.getAttribute( 'normal' );

		if ( originalNormal !== undefined && ! this.isNormalizedNormalAttribute( originalNormal ) ) {

			console.warn( 'THREE.GLTFExporter: Creating normalized normal attribute from the non-normalized one.' );

			geometry.setAttribute( 'normal', this.createNormalizedNormalAttribute( originalNormal ) );

		}

		// @QUESTION Detect if .vertexColors = true?
		// For every attribute create an accessor
		let modifiedAttribute = null;

		for ( let attributeName in geometry.attributes ) {

			// Ignore morph target attributes, which are exported later.
			if ( attributeName.slice( 0, 5 ) === 'morph' ) continue;

			const attribute = geometry.attributes[ attributeName ];
			attributeName = nameConversion[ attributeName ] || attributeName.toUpperCase();

			// Prefix all geometry attributes except the ones specifically
			// listed in the spec; non-spec attributes are considered custom.
			const validVertexAttributes =
					/^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+|COLOR_\d+|JOINTS_\d+|WEIGHTS_\d+)$/;

			if ( ! validVertexAttributes.test( attributeName ) ) attributeName = '_' + attributeName;

			if ( cache.attributes.has( this.getUID( attribute ) ) ) {

				attributes[ attributeName ] = cache.attributes.get( this.getUID( attribute ) );
				continue;

			}

			// Enforce glTF vertex attribute requirements:
			// - JOINTS_0 must be UNSIGNED_BYTE or UNSIGNED_SHORT
			// - Only custom attributes may be INT or UNSIGNED_INT
			modifiedAttribute = null;
			const array = attribute.array;

			if ( attributeName === 'JOINTS_0' &&
				! ( array instanceof Uint16Array ) &&
				! ( array instanceof Uint8Array ) ) {

				console.warn( 'GLTFExporter: Attribute "skinIndex" converted to type UNSIGNED_SHORT.' );
				modifiedAttribute = new BufferAttribute( new Uint16Array( array ), attribute.itemSize, attribute.normalized );

			} else if ( ( array instanceof Uint32Array || array instanceof Int32Array ) && ! attributeName.startsWith( '_' ) ) {

				console.warn( `GLTFExporter: Attribute "${ attributeName }" converted to type FLOAT.` );
				modifiedAttribute = GLTFExporter.Utils.toFloat32BufferAttribute( attribute );

			}

			const accessor = this.processAccessor( modifiedAttribute || attribute, geometry );

			if ( accessor !== null ) {

				if ( ! attributeName.startsWith( '_' ) ) {

					this.detectMeshQuantization( attributeName, attribute );

				}

				attributes[ attributeName ] = accessor;
				cache.attributes.set( this.getUID( attribute ), accessor );

			}

		}

		if ( originalNormal !== undefined ) geometry.setAttribute( 'normal', originalNormal );

		// Skip if no exportable attributes found
		if ( Object.keys( attributes ).length === 0 ) return null;

		// Morph targets
		if ( mesh.morphTargetInfluences !== undefined && mesh.morphTargetInfluences.length > 0 ) {

			const weights = [];
			const targetNames = [];
			const reverseDictionary = {};

			if ( mesh.morphTargetDictionary !== undefined ) {

				for ( const key in mesh.morphTargetDictionary ) {

					reverseDictionary[ mesh.morphTargetDictionary[ key ] ] = key;

				}

			}

			for ( let i = 0; i < mesh.morphTargetInfluences.length; ++ i ) {

				const target = {};
				let warned = false;

				for ( const attributeName in geometry.morphAttributes ) {

					// glTF 2.0 morph supports only POSITION/NORMAL/TANGENT.
					// Three.js doesn't support TANGENT yet.

					if ( attributeName !== 'position' && attributeName !== 'normal' ) {

						if ( ! warned ) {

							console.warn( 'GLTFExporter: Only POSITION and NORMAL morph are supported.' );
							warned = true;

						}

						continue;

					}

					const attribute = geometry.morphAttributes[ attributeName ][ i ];
					const gltfAttributeName = attributeName.toUpperCase();

					// Three.js morph attribute has absolute values while the one of glTF has relative values.
					//
					// glTF 2.0 Specification:
					// https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#morph-targets

					const baseAttribute = geometry.attributes[ attributeName ];

					if ( cache.attributes.has( this.getUID( attribute, true ) ) ) {

						target[ gltfAttributeName ] = cache.attributes.get( this.getUID( attribute, true ) );
						continue;

					}

					// Clones attribute not to override
					const relativeAttribute = attribute.clone();

					if ( ! geometry.morphTargetsRelative ) {

						for ( let j = 0, jl = attribute.count; j < jl; j ++ ) {

							for ( let a = 0; a < attribute.itemSize; a ++ ) {

								if ( a === 0 ) relativeAttribute.setX( j, attribute.getX( j ) - baseAttribute.getX( j ) );
								if ( a === 1 ) relativeAttribute.setY( j, attribute.getY( j ) - baseAttribute.getY( j ) );
								if ( a === 2 ) relativeAttribute.setZ( j, attribute.getZ( j ) - baseAttribute.getZ( j ) );
								if ( a === 3 ) relativeAttribute.setW( j, attribute.getW( j ) - baseAttribute.getW( j ) );

							}

						}

					}

					target[ gltfAttributeName ] = this.processAccessor( relativeAttribute, geometry );
					cache.attributes.set( this.getUID( baseAttribute, true ), target[ gltfAttributeName ] );

				}

				targets.push( target );

				weights.push( mesh.morphTargetInfluences[ i ] );

				if ( mesh.morphTargetDictionary !== undefined ) targetNames.push( reverseDictionary[ i ] );

			}

			meshDef.weights = weights;

			if ( targetNames.length > 0 ) {

				meshDef.extras = {};
				meshDef.extras.targetNames = targetNames;

			}

		}

		const isMultiMaterial = Array.isArray( mesh.material );

		if ( isMultiMaterial && geometry.groups.length === 0 ) return null;

		let didForceIndices = false;

		if ( isMultiMaterial && geometry.index === null ) {

			const indices = [];

			for ( let i = 0, il = geometry.attributes.position.count; i < il; i ++ ) {

				indices[ i ] = i;

			}

			geometry.setIndex( indices );

			didForceIndices = true;

		}

		const materials = isMultiMaterial ? mesh.material : [ mesh.material ];
		const groups = isMultiMaterial ? geometry.groups : [ { materialIndex: 0, start: undefined, count: undefined } ];

		for ( let i = 0, il = groups.length; i < il; i ++ ) {

			const primitive = {
				mode: mode,
				attributes: attributes,
			};

			this.serializeUserData( geometry, primitive );

			if ( targets.length > 0 ) primitive.targets = targets;

			if ( geometry.index !== null ) {

				let cacheKey = this.getUID( geometry.index );

				if ( groups[ i ].start !== undefined || groups[ i ].count !== undefined ) {

					cacheKey += ':' + groups[ i ].start + ':' + groups[ i ].count;

				}

				if ( cache.attributes.has( cacheKey ) ) {

					primitive.indices = cache.attributes.get( cacheKey );

				} else {

					primitive.indices = this.processAccessor( geometry.index, geometry, groups[ i ].start, groups[ i ].count );
					cache.attributes.set( cacheKey, primitive.indices );

				}

				if ( primitive.indices === null ) delete primitive.indices;

			}

			const material = await this.processMaterialAsync( materials[ groups[ i ].materialIndex ] );

			if ( material !== null ) primitive.material = material;

			primitives.push( primitive );

		}

		if ( didForceIndices === true ) {

			geometry.setIndex( null );

		}

		meshDef.primitives = primitives;

		if ( ! json.meshes ) json.meshes = [];

		await this._invokeAllAsync( function ( ext ) {

			ext.writeMesh && ext.writeMesh( mesh, meshDef );

		} );

		const index = json.meshes.push( meshDef ) - 1;
		cache.meshes.set( meshCacheKey, index );
		return index;

	}

	/**
	 * If a vertex attribute with a
	 * [non-standard data type](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes-overview)
	 * is used, it is checked whether it is a valid data type according to the
	 * [KHR_mesh_quantization](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md)
	 * extension.
	 * In this case the extension is automatically added to the list of used extensions.
	 *
	 * @param {string} attributeName
	 * @param {THREE.BufferAttribute} attribute
	 */
	detectMeshQuantization( attributeName, attribute ) {

		if ( this.extensionsUsed[ KHR_MESH_QUANTIZATION ] ) return;

		let attrType = undefined;

		switch ( attribute.array.constructor ) {

			case Int8Array:

				attrType = 'byte';

				break;

			case Uint8Array:

				attrType = 'unsigned byte';

				break;

			case Int16Array:

				attrType = 'short';

				break;

			case Uint16Array:

				attrType = 'unsigned short';

				break;

			default:

				return;

		}

		if ( attribute.normalized ) attrType += ' normalized';

		const attrNamePrefix = attributeName.split( '_', 1 )[ 0 ];

		if ( KHR_mesh_quantization_ExtraAttrTypes[ attrNamePrefix ] && KHR_mesh_quantization_ExtraAttrTypes[ attrNamePrefix ].includes( attrType ) ) {

			this.extensionsUsed[ KHR_MESH_QUANTIZATION ] = true;
			this.extensionsRequired[ KHR_MESH_QUANTIZATION ] = true;

		}

	}

	/**
	 * Process camera
	 * @param {THREE.Camera} camera Camera to process
	 * @return {number} Index of the processed mesh in the "camera" array
	 */
	processCamera( camera ) {

		const json = this.json;

		if ( ! json.cameras ) json.cameras = [];

		const isOrtho = camera.isOrthographicCamera;

		const cameraDef = {
			type: isOrtho ? 'orthographic' : 'perspective'
		};

		if ( isOrtho ) {

			cameraDef.orthographic = {
				xmag: camera.right * 2,
				ymag: camera.top * 2,
				zfar: camera.far <= 0 ? 0.001 : camera.far,
				znear: camera.near < 0 ? 0 : camera.near
			};

		} else {

			cameraDef.perspective = {
				aspectRatio: camera.aspect,
				yfov: MathUtils.degToRad( camera.fov ),
				zfar: camera.far <= 0 ? 0.001 : camera.far,
				znear: camera.near < 0 ? 0 : camera.near
			};

		}

		// Question: Is saving "type" as name intentional?
		if ( camera.name !== '' ) cameraDef.name = camera.type;

		return json.cameras.push( cameraDef ) - 1;

	}

	/**
	 * Creates glTF animation entry from AnimationClip object.
	 *
	 * Status:
	 * - Only properties listed in PATH_PROPERTIES may be animated.
	 *
	 * @param {THREE.AnimationClip} clip
	 * @param {THREE.Object3D} root
	 * @return {?number}
	 */
	processAnimation( clip, root ) {

		const json = this.json;
		const nodeMap = this.nodeMap;

		if ( ! json.animations ) json.animations = [];

		clip = GLTFExporter.Utils.mergeMorphTargetTracks( clip.clone(), root );

		const tracks = clip.tracks;
		const channels = [];
		const samplers = [];

		for ( let i = 0; i < tracks.length; ++ i ) {

			const track = tracks[ i ];
			const trackBinding = PropertyBinding.parseTrackName( track.name );
			let trackNode = PropertyBinding.findNode( root, trackBinding.nodeName );
			const trackProperty = PATH_PROPERTIES[ trackBinding.propertyName ];

			if ( trackBinding.objectName === 'bones' ) {

				if ( trackNode.isSkinnedMesh === true ) {

					trackNode = trackNode.skeleton.getBoneByName( trackBinding.objectIndex );

				} else {

					trackNode = undefined;

				}

			}

			if ( ! trackNode || ! trackProperty ) {

				console.warn( 'THREE.GLTFExporter: Could not export animation track "%s".', track.name );
				continue;

			}

			const inputItemSize = 1;
			let outputItemSize = track.values.length / track.times.length;

			if ( trackProperty === PATH_PROPERTIES.morphTargetInfluences ) {

				outputItemSize /= trackNode.morphTargetInfluences.length;

			}

			let interpolation;

			// @TODO export CubicInterpolant(InterpolateSmooth) as CUBICSPLINE

			// Detecting glTF cubic spline interpolant by checking factory method's special property
			// GLTFCubicSplineInterpolant is a custom interpolant and track doesn't return
			// valid value from .getInterpolation().
			if ( track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline === true ) {

				interpolation = 'CUBICSPLINE';

				// itemSize of CUBICSPLINE keyframe is 9
				// (VEC3 * 3: inTangent, splineVertex, and outTangent)
				// but needs to be stored as VEC3 so dividing by 3 here.
				outputItemSize /= 3;

			} else if ( track.getInterpolation() === InterpolateDiscrete ) {

				interpolation = 'STEP';

			} else {

				interpolation = 'LINEAR';

			}

			samplers.push( {
				input: this.processAccessor( new BufferAttribute( track.times, inputItemSize ) ),
				output: this.processAccessor( new BufferAttribute( track.values, outputItemSize ) ),
				interpolation: interpolation
			} );

			channels.push( {
				sampler: samplers.length - 1,
				target: {
					node: nodeMap.get( trackNode ),
					path: trackProperty
				}
			} );

		}

		const animationDef = {
			name: clip.name || 'clip_' + json.animations.length,
			samplers: samplers,
			channels: channels
		};

		this.serializeUserData( clip, animationDef );

		json.animations.push( animationDef );

		return json.animations.length - 1;

	}

	/**
	 * @param {THREE.Object3D} object
	 * @return {?number}
	 */
	 processSkin( object ) {

		const json = this.json;
		const nodeMap = this.nodeMap;

		const node = json.nodes[ nodeMap.get( object ) ];

		const skeleton = object.skeleton;

		if ( skeleton === undefined ) return null;

		const rootJoint = object.skeleton.bones[ 0 ];

		if ( rootJoint === undefined ) return null;

		const joints = [];
		const inverseBindMatrices = new Float32Array( skeleton.bones.length * 16 );
		const temporaryBoneInverse = new Matrix4();

		for ( let i = 0; i < skeleton.bones.length; ++ i ) {

			joints.push( nodeMap.get( skeleton.bones[ i ] ) );
			temporaryBoneInverse.copy( skeleton.boneInverses[ i ] );
			temporaryBoneInverse.multiply( object.bindMatrix ).toArray( inverseBindMatrices, i * 16 );

		}

		if ( json.skins === undefined ) json.skins = [];

		json.skins.push( {
			inverseBindMatrices: this.processAccessor( new BufferAttribute( inverseBindMatrices, 16 ) ),
			joints: joints,
			skeleton: nodeMap.get( rootJoint )
		} );

		const skinIndex = node.skin = json.skins.length - 1;

		return skinIndex;

	}

	/**
	 * Process Object3D node
	 * @param {THREE.Object3D} object Object3D to processNodeAsync
	 * @return {Promise<number>} Index of the node in the nodes list
	 */
	async processNodeAsync( object ) {

		const json = this.json;
		const options = this.options;
		const nodeMap = this.nodeMap;

		if ( ! json.nodes ) json.nodes = [];

		const nodeDef = {};

		if ( options.trs ) {

			const rotation = object.quaternion.toArray();
			const position = object.position.toArray();
			const scale = object.scale.toArray();

			if ( ! equalArray( rotation, [ 0, 0, 0, 1 ] ) ) {

				nodeDef.rotation = rotation;

			}

			if ( ! equalArray( position, [ 0, 0, 0 ] ) ) {

				nodeDef.translation = position;

			}

			if ( ! equalArray( scale, [ 1, 1, 1 ] ) ) {

				nodeDef.scale = scale;

			}

		} else {

			if ( object.matrixAutoUpdate ) {

				object.updateMatrix();

			}

			if ( isIdentityMatrix( object.matrix ) === false ) {

				nodeDef.matrix = object.matrix.elements;

			}

		}

		// We don't export empty strings name because it represents no-name in Three.js.
		if ( object.name !== '' ) nodeDef.name = String( object.name );

		this.serializeUserData( object, nodeDef );

		if ( object.isMesh || object.isLine || object.isPoints ) {

			const meshIndex = await this.processMeshAsync( object );

			if ( meshIndex !== null ) nodeDef.mesh = meshIndex;

		} else if ( object.isCamera ) {

			nodeDef.camera = this.processCamera( object );

		}

		if ( object.isSkinnedMesh ) this.skins.push( object );

		const nodeIndex = json.nodes.push( nodeDef ) - 1;
		nodeMap.set( object, nodeIndex );

		if ( object.children.length > 0 ) {

			const children = [];

			for ( let i = 0, l = object.children.length; i < l; i ++ ) {

				const child = object.children[ i ];

				if ( child.visible || options.onlyVisible === false ) {

					const childNodeIndex = await this.processNodeAsync( child );

					if ( childNodeIndex !== null ) children.push( childNodeIndex );

				}

			}

			if ( children.length > 0 ) nodeDef.children = children;

		}

		await this._invokeAllAsync( function ( ext ) {

			ext.writeNode && ext.writeNode( object, nodeDef );

		} );

		return nodeIndex;

	}

	/**
	 * Process Scene
	 * @param {Scene} scene Scene to process
	 */
	async processSceneAsync( scene ) {

		const json = this.json;
		const options = this.options;

		if ( ! json.scenes ) {

			json.scenes = [];
			json.scene = 0;

		}

		const sceneDef = {};

		if ( scene.name !== '' ) sceneDef.name = scene.name;

		json.scenes.push( sceneDef );

		const nodes = [];

		for ( let i = 0, l = scene.children.length; i < l; i ++ ) {

			const child = scene.children[ i ];

			if ( child.visible || options.onlyVisible === false ) {

				const nodeIndex = await this.processNodeAsync( child );

				if ( nodeIndex !== null ) nodes.push( nodeIndex );

			}

		}

		if ( nodes.length > 0 ) sceneDef.nodes = nodes;

		this.serializeUserData( scene, sceneDef );

	}

	/**
	 * Creates a Scene to hold a list of objects and parse it
	 * @param {Array<THREE.Object3D>} objects List of objects to process
	 */
	async processObjectsAsync( objects ) {

		const scene = new Scene();
		scene.name = 'AuxScene';

		for ( let i = 0; i < objects.length; i ++ ) {

			// We push directly to children instead of calling `add` to prevent
			// modify the .parent and break its original scene and hierarchy
			scene.children.push( objects[ i ] );

		}

		await this.processSceneAsync( scene );

	}

	/**
	 * @param {THREE.Object3D|Array<THREE.Object3D>} input
	 */
	async processInputAsync( input ) {

		const options = this.options;

		input = input instanceof Array ? input : [ input ];

		await this._invokeAllAsync( function ( ext ) {

			ext.beforeParse && ext.beforeParse( input );

		} );

		const objectsWithoutScene = [];

		for ( let i = 0; i < input.length; i ++ ) {

			if ( input[ i ] instanceof Scene ) {

				await this.processSceneAsync( input[ i ] );

			} else {

				objectsWithoutScene.push( input[ i ] );

			}

		}

		if ( objectsWithoutScene.length > 0 ) {

			await this.processObjectsAsync( objectsWithoutScene );

		}

		for ( let i = 0; i < this.skins.length; ++ i ) {

			this.processSkin( this.skins[ i ] );

		}

		for ( let i = 0; i < options.animations.length; ++ i ) {

			this.processAnimation( options.animations[ i ], input[ 0 ] );

		}

		await this._invokeAllAsync( function ( ext ) {

			ext.afterParse && ext.afterParse( input );

		} );

	}

	async _invokeAllAsync( func ) {

		for ( let i = 0, il = this.plugins.length; i < il; i ++ ) {

			await func( this.plugins[ i ] );

		}

	}

}

/**
 * Punctual Lights Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_lights_punctual
 *
 * @private
 */
class GLTFLightExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_lights_punctual';

	}

	writeNode( light, nodeDef ) {

		if ( ! light.isLight ) return;

		if ( ! light.isDirectionalLight && ! light.isPointLight && ! light.isSpotLight ) {

			console.warn( 'THREE.GLTFExporter: Only directional, point, and spot lights are supported.', light );
			return;

		}

		const writer = this.writer;
		const json = writer.json;
		const extensionsUsed = writer.extensionsUsed;

		const lightDef = {};

		if ( light.name ) lightDef.name = light.name;

		lightDef.color = light.color.toArray();

		lightDef.intensity = light.intensity;

		if ( light.isDirectionalLight ) {

			lightDef.type = 'directional';

		} else if ( light.isPointLight ) {

			lightDef.type = 'point';

			if ( light.distance > 0 ) lightDef.range = light.distance;

		} else if ( light.isSpotLight ) {

			lightDef.type = 'spot';

			if ( light.distance > 0 ) lightDef.range = light.distance;

			lightDef.spot = {};
			lightDef.spot.innerConeAngle = ( 1.0 - light.penumbra ) * light.angle;
			lightDef.spot.outerConeAngle = light.angle;

		}

		if ( light.decay !== undefined && light.decay !== 2 ) {

			console.warn( 'THREE.GLTFExporter: Light decay may be lost. glTF is physically-based, '
				+ 'and expects light.decay=2.' );

		}

		if ( light.target
				&& ( light.target.parent !== light
				|| light.target.position.x !== 0
				|| light.target.position.y !== 0
				|| light.target.position.z !== -1 ) ) {

			console.warn( 'THREE.GLTFExporter: Light direction may be lost. For best results, '
				+ 'make light.target a child of the light with position 0,0,-1.' );

		}

		if ( ! extensionsUsed[ this.name ] ) {

			json.extensions = json.extensions || {};
			json.extensions[ this.name ] = { lights: [] };
			extensionsUsed[ this.name ] = true;

		}

		const lights = json.extensions[ this.name ].lights;
		lights.push( lightDef );

		nodeDef.extensions = nodeDef.extensions || {};
		nodeDef.extensions[ this.name ] = { light: lights.length - 1 };

	}

}

/**
 * Unlit Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit
 *
 * @private
 */
class GLTFMaterialsUnlitExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_unlit';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshBasicMaterial ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = {};

		extensionsUsed[ this.name ] = true;

		materialDef.pbrMetallicRoughness.metallicFactor = 0.0;
		materialDef.pbrMetallicRoughness.roughnessFactor = 0.9;

	}

}

/**
 * Clearcoat Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_clearcoat
 *
 * @private
 */
class GLTFMaterialsClearcoatExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_clearcoat';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.clearcoat === 0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.clearcoatFactor = material.clearcoat;

		if ( material.clearcoatMap ) {

			const clearcoatMapDef = {
				index: await writer.processTextureAsync( material.clearcoatMap ),
				texCoord: material.clearcoatMap.channel
			};
			writer.applyTextureTransform( clearcoatMapDef, material.clearcoatMap );
			extensionDef.clearcoatTexture = clearcoatMapDef;

		}

		extensionDef.clearcoatRoughnessFactor = material.clearcoatRoughness;

		if ( material.clearcoatRoughnessMap ) {

			const clearcoatRoughnessMapDef = {
				index: await writer.processTextureAsync( material.clearcoatRoughnessMap ),
				texCoord: material.clearcoatRoughnessMap.channel
			};
			writer.applyTextureTransform( clearcoatRoughnessMapDef, material.clearcoatRoughnessMap );
			extensionDef.clearcoatRoughnessTexture = clearcoatRoughnessMapDef;

		}

		if ( material.clearcoatNormalMap ) {

			const clearcoatNormalMapDef = {
				index: await writer.processTextureAsync( material.clearcoatNormalMap ),
				texCoord: material.clearcoatNormalMap.channel
			};

			if ( material.clearcoatNormalScale.x !== 1 ) clearcoatNormalMapDef.scale = material.clearcoatNormalScale.x;

			writer.applyTextureTransform( clearcoatNormalMapDef, material.clearcoatNormalMap );
			extensionDef.clearcoatNormalTexture = clearcoatNormalMapDef;

		}

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;


	}

}

/**
 * Materials dispersion Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_dispersion
 *
 * @private
 */
class GLTFMaterialsDispersionExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_dispersion';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.dispersion === 0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.dispersion = material.dispersion;

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Iridescence Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_iridescence
 *
 * @private
 */
class GLTFMaterialsIridescenceExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_iridescence';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.iridescence === 0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.iridescenceFactor = material.iridescence;

		if ( material.iridescenceMap ) {

			const iridescenceMapDef = {
				index: await writer.processTextureAsync( material.iridescenceMap ),
				texCoord: material.iridescenceMap.channel
			};
			writer.applyTextureTransform( iridescenceMapDef, material.iridescenceMap );
			extensionDef.iridescenceTexture = iridescenceMapDef;

		}

		extensionDef.iridescenceIor = material.iridescenceIOR;
		extensionDef.iridescenceThicknessMinimum = material.iridescenceThicknessRange[ 0 ];
		extensionDef.iridescenceThicknessMaximum = material.iridescenceThicknessRange[ 1 ];

		if ( material.iridescenceThicknessMap ) {

			const iridescenceThicknessMapDef = {
				index: await writer.processTextureAsync( material.iridescenceThicknessMap ),
				texCoord: material.iridescenceThicknessMap.channel
			};
			writer.applyTextureTransform( iridescenceThicknessMapDef, material.iridescenceThicknessMap );
			extensionDef.iridescenceThicknessTexture = iridescenceThicknessMapDef;

		}

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Transmission Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_transmission
 *
 * @private
 */
class GLTFMaterialsTransmissionExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_transmission';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.transmission === 0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.transmissionFactor = material.transmission;

		if ( material.transmissionMap ) {

			const transmissionMapDef = {
				index: await writer.processTextureAsync( material.transmissionMap ),
				texCoord: material.transmissionMap.channel
			};
			writer.applyTextureTransform( transmissionMapDef, material.transmissionMap );
			extensionDef.transmissionTexture = transmissionMapDef;

		}

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Materials Volume Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_volume
 *
 * @private
 */
class GLTFMaterialsVolumeExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_volume';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.transmission === 0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.thicknessFactor = material.thickness;

		if ( material.thicknessMap ) {

			const thicknessMapDef = {
				index: await writer.processTextureAsync( material.thicknessMap ),
				texCoord: material.thicknessMap.channel
			};
			writer.applyTextureTransform( thicknessMapDef, material.thicknessMap );
			extensionDef.thicknessTexture = thicknessMapDef;

		}

		if ( material.attenuationDistance !== Infinity ) {

			extensionDef.attenuationDistance = material.attenuationDistance;

		}

		extensionDef.attenuationColor = material.attenuationColor.toArray();

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Materials ior Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_ior
 *
 * @private
 */
class GLTFMaterialsIorExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_ior';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.ior === 1.5 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.ior = material.ior;

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Materials specular Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_specular
 *
 * @private
 */
class GLTFMaterialsSpecularExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_specular';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || ( material.specularIntensity === 1.0 &&
		       material.specularColor.equals( DEFAULT_SPECULAR_COLOR ) &&
		     ! material.specularIntensityMap && ! material.specularColorMap ) ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		if ( material.specularIntensityMap ) {

			const specularIntensityMapDef = {
				index: await writer.processTextureAsync( material.specularIntensityMap ),
				texCoord: material.specularIntensityMap.channel
			};
			writer.applyTextureTransform( specularIntensityMapDef, material.specularIntensityMap );
			extensionDef.specularTexture = specularIntensityMapDef;

		}

		if ( material.specularColorMap ) {

			const specularColorMapDef = {
				index: await writer.processTextureAsync( material.specularColorMap ),
				texCoord: material.specularColorMap.channel
			};
			writer.applyTextureTransform( specularColorMapDef, material.specularColorMap );
			extensionDef.specularColorTexture = specularColorMapDef;

		}

		extensionDef.specularFactor = material.specularIntensity;
		extensionDef.specularColorFactor = material.specularColor.toArray();

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Sheen Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_sheen
 *
 * @private
 */
class GLTFMaterialsSheenExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_sheen';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.sheen == 0.0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		if ( material.sheenRoughnessMap ) {

			const sheenRoughnessMapDef = {
				index: await writer.processTextureAsync( material.sheenRoughnessMap ),
				texCoord: material.sheenRoughnessMap.channel
			};
			writer.applyTextureTransform( sheenRoughnessMapDef, material.sheenRoughnessMap );
			extensionDef.sheenRoughnessTexture = sheenRoughnessMapDef;

		}

		if ( material.sheenColorMap ) {

			const sheenColorMapDef = {
				index: await writer.processTextureAsync( material.sheenColorMap ),
				texCoord: material.sheenColorMap.channel
			};
			writer.applyTextureTransform( sheenColorMapDef, material.sheenColorMap );
			extensionDef.sheenColorTexture = sheenColorMapDef;

		}

		extensionDef.sheenRoughnessFactor = material.sheenRoughness;
		extensionDef.sheenColorFactor = material.sheenColor.toArray();

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Anisotropy Materials Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_anisotropy
 *
 * @private
 */
class GLTFMaterialsAnisotropyExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_anisotropy';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshPhysicalMaterial || material.anisotropy == 0.0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		if ( material.anisotropyMap ) {

			const anisotropyMapDef = { index: await writer.processTextureAsync( material.anisotropyMap ) };
			writer.applyTextureTransform( anisotropyMapDef, material.anisotropyMap );
			extensionDef.anisotropyTexture = anisotropyMapDef;

		}

		extensionDef.anisotropyStrength = material.anisotropy;
		extensionDef.anisotropyRotation = material.anisotropyRotation;

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * Materials Emissive Strength Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/blob/5768b3ce0ef32bc39cdf1bef10b948586635ead3/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md
 *
 * @private
 */
class GLTFMaterialsEmissiveStrengthExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'KHR_materials_emissive_strength';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshStandardMaterial || material.emissiveIntensity === 1.0 ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		extensionDef.emissiveStrength = material.emissiveIntensity;

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}


/**
 * Materials bump Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/EXT_materials_bump
 *
 * @private
 */
class GLTFMaterialsBumpExtension {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'EXT_materials_bump';

	}

	async writeMaterialAsync( material, materialDef ) {

		if ( ! material.isMeshStandardMaterial || (
		       material.bumpScale === 1 &&
		     ! material.bumpMap ) ) return;

		const writer = this.writer;
		const extensionsUsed = writer.extensionsUsed;

		const extensionDef = {};

		if ( material.bumpMap ) {

			const bumpMapDef = {
				index: await writer.processTextureAsync( material.bumpMap ),
				texCoord: material.bumpMap.channel
			};
			writer.applyTextureTransform( bumpMapDef, material.bumpMap );
			extensionDef.bumpTexture = bumpMapDef;

		}

		extensionDef.bumpFactor = material.bumpScale;

		materialDef.extensions = materialDef.extensions || {};
		materialDef.extensions[ this.name ] = extensionDef;

		extensionsUsed[ this.name ] = true;

	}

}

/**
 * GPU Instancing Extension
 *
 * Specification: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Vendor/EXT_mesh_gpu_instancing
 *
 * @private
 */
class GLTFMeshGpuInstancing {

	constructor( writer ) {

		this.writer = writer;
		this.name = 'EXT_mesh_gpu_instancing';

	}

	writeNode( object, nodeDef ) {

		if ( ! object.isInstancedMesh ) return;

		const writer = this.writer;

		const mesh = object;

		const translationAttr = new Float32Array( mesh.count * 3 );
		const rotationAttr = new Float32Array( mesh.count * 4 );
		const scaleAttr = new Float32Array( mesh.count * 3 );

		const matrix = new Matrix4();
		const position = new Vector3();
		const quaternion = new Quaternion();
		const scale = new Vector3();

		for ( let i = 0; i < mesh.count; i ++ ) {

			mesh.getMatrixAt( i, matrix );
			matrix.decompose( position, quaternion, scale );

			position.toArray( translationAttr, i * 3 );
			quaternion.toArray( rotationAttr, i * 4 );
			scale.toArray( scaleAttr, i * 3 );

		}

		const attributes = {
			TRANSLATION: writer.processAccessor( new BufferAttribute( translationAttr, 3 ) ),
			ROTATION: writer.processAccessor( new BufferAttribute( rotationAttr, 4 ) ),
			SCALE: writer.processAccessor( new BufferAttribute( scaleAttr, 3 ) ),
		};

		if ( mesh.instanceColor )
			attributes._COLOR_0 = writer.processAccessor( mesh.instanceColor );

		nodeDef.extensions = nodeDef.extensions || {};
		nodeDef.extensions[ this.name ] = { attributes };

		writer.extensionsUsed[ this.name ] = true;
		writer.extensionsRequired[ this.name ] = true;

	}

}

/**
 * Static utility functions
 *
 * @private
 */
GLTFExporter.Utils = {

	insertKeyframe: function ( track, time ) {

		const tolerance = 0.001; // 1ms
		const valueSize = track.getValueSize();

		const times = new track.TimeBufferType( track.times.length + 1 );
		const values = new track.ValueBufferType( track.values.length + valueSize );
		const interpolant = track.createInterpolant( new track.ValueBufferType( valueSize ) );

		let index;

		if ( track.times.length === 0 ) {

			times[ 0 ] = time;

			for ( let i = 0; i < valueSize; i ++ ) {

				values[ i ] = 0;

			}

			index = 0;

		} else if ( time < track.times[ 0 ] ) {

			if ( Math.abs( track.times[ 0 ] - time ) < tolerance ) return 0;

			times[ 0 ] = time;
			times.set( track.times, 1 );

			values.set( interpolant.evaluate( time ), 0 );
			values.set( track.values, valueSize );

			index = 0;

		} else if ( time > track.times[ track.times.length - 1 ] ) {

			if ( Math.abs( track.times[ track.times.length - 1 ] - time ) < tolerance ) {

				return track.times.length - 1;

			}

			times[ times.length - 1 ] = time;
			times.set( track.times, 0 );

			values.set( track.values, 0 );
			values.set( interpolant.evaluate( time ), track.values.length );

			index = times.length - 1;

		} else {

			for ( let i = 0; i < track.times.length; i ++ ) {

				if ( Math.abs( track.times[ i ] - time ) < tolerance ) return i;

				if ( track.times[ i ] < time && track.times[ i + 1 ] > time ) {

					times.set( track.times.slice( 0, i + 1 ), 0 );
					times[ i + 1 ] = time;
					times.set( track.times.slice( i + 1 ), i + 2 );

					values.set( track.values.slice( 0, ( i + 1 ) * valueSize ), 0 );
					values.set( interpolant.evaluate( time ), ( i + 1 ) * valueSize );
					values.set( track.values.slice( ( i + 1 ) * valueSize ), ( i + 2 ) * valueSize );

					index = i + 1;

					break;

				}

			}

		}

		track.times = times;
		track.values = values;

		return index;

	},

	mergeMorphTargetTracks: function ( clip, root ) {

		const tracks = [];
		const mergedTracks = {};
		const sourceTracks = clip.tracks;

		for ( let i = 0; i < sourceTracks.length; ++ i ) {

			let sourceTrack = sourceTracks[ i ];
			const sourceTrackBinding = PropertyBinding.parseTrackName( sourceTrack.name );
			const sourceTrackNode = PropertyBinding.findNode( root, sourceTrackBinding.nodeName );

			if ( sourceTrackBinding.propertyName !== 'morphTargetInfluences' || sourceTrackBinding.propertyIndex === undefined ) {

				// Tracks that don't affect morph targets, or that affect all morph targets together, can be left as-is.
				tracks.push( sourceTrack );
				continue;

			}

			if ( sourceTrack.createInterpolant !== sourceTrack.InterpolantFactoryMethodDiscrete
				&& sourceTrack.createInterpolant !== sourceTrack.InterpolantFactoryMethodLinear ) {

				if ( sourceTrack.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline ) {

					// This should never happen, because glTF morph target animations
					// affect all targets already.
					throw new Error( 'THREE.GLTFExporter: Cannot merge tracks with glTF CUBICSPLINE interpolation.' );

				}

				console.warn( 'THREE.GLTFExporter: Morph target interpolation mode not yet supported. Using LINEAR instead.' );

				sourceTrack = sourceTrack.clone();
				sourceTrack.setInterpolation( InterpolateLinear );

			}

			const targetCount = sourceTrackNode.morphTargetInfluences.length;
			const targetIndex = sourceTrackNode.morphTargetDictionary[ sourceTrackBinding.propertyIndex ];

			if ( targetIndex === undefined ) {

				throw new Error( 'THREE.GLTFExporter: Morph target name not found: ' + sourceTrackBinding.propertyIndex );

			}

			let mergedTrack;

			// If this is the first time we've seen this object, create a new
			// track to store merged keyframe data for each morph target.
			if ( mergedTracks[ sourceTrackNode.uuid ] === undefined ) {

				mergedTrack = sourceTrack.clone();

				const values = new mergedTrack.ValueBufferType( targetCount * mergedTrack.times.length );

				for ( let j = 0; j < mergedTrack.times.length; j ++ ) {

					values[ j * targetCount + targetIndex ] = mergedTrack.values[ j ];

				}

				// We need to take into consideration the intended target node
				// of our original un-merged morphTarget animation.
				mergedTrack.name = ( sourceTrackBinding.nodeName || '' ) + '.morphTargetInfluences';
				mergedTrack.values = values;

				mergedTracks[ sourceTrackNode.uuid ] = mergedTrack;
				tracks.push( mergedTrack );

				continue;

			}

			const sourceInterpolant = sourceTrack.createInterpolant( new sourceTrack.ValueBufferType( 1 ) );

			mergedTrack = mergedTracks[ sourceTrackNode.uuid ];

			// For every existing keyframe of the merged track, write a (possibly
			// interpolated) value from the source track.
			for ( let j = 0; j < mergedTrack.times.length; j ++ ) {

				mergedTrack.values[ j * targetCount + targetIndex ] = sourceInterpolant.evaluate( mergedTrack.times[ j ] );

			}

			// For every existing keyframe of the source track, write a (possibly
			// new) keyframe to the merged track. Values from the previous loop may
			// be written again, but keyframes are de-duplicated.
			for ( let j = 0; j < sourceTrack.times.length; j ++ ) {

				const keyframeIndex = this.insertKeyframe( mergedTrack, sourceTrack.times[ j ] );
				mergedTrack.values[ keyframeIndex * targetCount + targetIndex ] = sourceTrack.values[ j ];

			}

		}

		clip.tracks = tracks;

		return clip;

	},

	toFloat32BufferAttribute: function ( srcAttribute ) {

		const dstAttribute = new BufferAttribute( new Float32Array( srcAttribute.count * srcAttribute.itemSize ), srcAttribute.itemSize, false );

		if ( ! srcAttribute.normalized && ! srcAttribute.isInterleavedBufferAttribute ) {

			dstAttribute.array.set( srcAttribute.array );

			return dstAttribute;

		}

		for ( let i = 0, il = srcAttribute.count; i < il; i ++ ) {

			for ( let j = 0; j < srcAttribute.itemSize; j ++ ) {

				dstAttribute.setComponent( i, j, srcAttribute.getComponent( i, j ) );

			}

		}

		return dstAttribute;

	}

};

export { FBXLoader as F, GLTFExporter as G, OrbitControls as O, PLYLoader as P, STLLoader as S, ThreeMFLoader as T, GLTFLoader as a, OBJLoader as b, mergeVertices as m };
