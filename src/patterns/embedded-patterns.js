/**
 * Embedded Systems Patterns
 * Architectural and design patterns specific to embedded systems and IoT devices
 */

class EmbeddedPatterns {
  constructor() {
    this.patterns = this._initializePatterns();
  }

  getAllPatterns() {
    return this.patterns;
  }

  selectPatterns(requirements, constraints) {
    const selected = {
      architectural: [],
      communication: [],
      power: [],
      memory: [],
      realtime: []
    };

    // Select architectural patterns based on system type
    if (constraints.realtime) {
      selected.architectural.push(this.patterns.architectural.superloop);
      selected.architectural.push(this.patterns.architectural.rtos);
    } else {
      selected.architectural.push(this.patterns.architectural.eventDriven);
    }

    // Communication patterns
    if (requirements.connectivity) {
      if (requirements.connectivity.includes('mqtt')) {
        selected.communication.push(this.patterns.communication.mqtt);
      }
      if (requirements.connectivity.includes('coap')) {
        selected.communication.push(this.patterns.communication.coap);
      }
    }

    // Power management
    if (constraints.batteryPowered) {
      selected.power.push(this.patterns.power.sleepModes);
      selected.power.push(this.patterns.power.dutyCycling);
    }

    // Memory patterns
    if (constraints.memory < 64 * 1024) { // Less than 64KB
      selected.memory.push(this.patterns.memory.staticAllocation);
      selected.memory.push(this.patterns.memory.poolAllocator);
    }

    return selected;
  }

  _initializePatterns() {
    return {
      architectural: {
        superloop: {
          name: 'Super Loop Architecture',
          description: 'Simple main loop architecture for basic embedded systems',
          structure: {
            initialization: 'Hardware and peripheral setup',
            mainLoop: 'Infinite loop processing tasks',
            stateManagement: 'Global state variables'
          },
          benefits: ['Simple', 'Predictable', 'Minimal overhead'],
          limitations: ['No true multitasking', 'Timing dependencies'],
          useCase: 'Simple sensors, basic controllers'
        },

        rtos: {
          name: 'RTOS-based Architecture',
          description: 'Real-time operating system for complex embedded systems',
          components: {
            kernel: 'Task scheduler and resource management',
            tasks: 'Independent execution units with priorities',
            synchronization: 'Semaphores, mutexes, queues',
            interrupts: 'ISR handlers with minimal processing'
          },
          frameworks: {
            freertos: 'FreeRTOS - popular open source',
            zephyr: 'Zephyr OS - Linux Foundation',
            threadx: 'Azure RTOS ThreadX',
            rtems: 'RTEMS for critical systems'
          },
          patterns: ['Task priority', 'Rate monotonic scheduling', 'Deadline scheduling']
        },

        eventDriven: {
          name: 'Event-Driven Architecture',
          description: 'State machines and event handlers',
          components: {
            eventQueue: 'Priority or FIFO event queue',
            stateMachine: 'Hierarchical state machines',
            dispatcher: 'Event routing and handling',
            timers: 'Software timers for periodic events'
          },
          benefits: ['Low power', 'Responsive', 'Modular'],
          frameworks: ['QP Framework', 'Statecharts']
        },

        layered: {
          name: 'Layered Embedded Architecture',
          description: 'Hardware abstraction layers',
          layers: {
            hal: {
              name: 'Hardware Abstraction Layer',
              responsibility: 'Direct hardware control',
              interfaces: 'Register access, peripheral drivers'
            },
            bsp: {
              name: 'Board Support Package',
              responsibility: 'Board-specific configuration',
              components: 'Clock config, pin mapping, bootloader'
            },
            middleware: {
              name: 'Middleware Layer',
              responsibility: 'Common services',
              components: 'File systems, network stacks, USB'
            },
            application: {
              name: 'Application Layer',
              responsibility: 'Business logic',
              isolation: 'Hardware independent'
            }
          }
        },

        microservices: {
          name: 'Embedded Microservices',
          description: 'Service-oriented architecture for embedded',
          components: {
            services: 'Independent functional modules',
            messageBus: 'Inter-service communication',
            discovery: 'Service registration and lookup',
            gateway: 'External communication interface'
          },
          protocols: ['DDS', 'SOME/IP', 'Custom IPC']
        }
      },

      communication: {
        mqtt: {
          name: 'MQTT Protocol',
          description: 'Lightweight publish-subscribe messaging',
          characteristics: {
            overhead: 'Minimal - 2 byte header',
            qos: ['At most once', 'At least once', 'Exactly once'],
            persistence: 'Session state and message queuing',
            security: 'TLS/SSL support'
          },
          patterns: {
            topics: 'Hierarchical topic structure',
            retained: 'Last known good value',
            will: 'Last will and testament'
          },
          libraries: ['Paho', 'AWS IoT SDK', 'Azure IoT SDK']
        },

        coap: {
          name: 'CoAP Protocol',
          description: 'Constrained Application Protocol for IoT',
          characteristics: {
            transport: 'UDP-based',
            restful: 'REST-like interface',
            discovery: 'Resource discovery',
            observe: 'Push notifications'
          },
          security: 'DTLS support',
          libraries: ['libcoap', 'Californium', 'CoAPthon']
        },

        modbus: {
          name: 'Modbus Protocol',
          description: 'Industrial communication protocol',
          variants: {
            rtu: 'Serial communication',
            tcp: 'Ethernet communication',
            ascii: 'ASCII serial'
          },
          topology: 'Master-slave architecture',
          useCases: ['PLCs', 'Industrial sensors', 'SCADA']
        },

        can: {
          name: 'CAN Bus',
          description: 'Controller Area Network for automotive/industrial',
          features: {
            arbitration: 'Message priority',
            errorHandling: 'Built-in error detection',
            broadcast: 'Multi-master broadcast'
          },
          protocols: ['CANopen', 'J1939', 'DeviceNet']
        },

        lorawan: {
          name: 'LoRaWAN',
          description: 'Long-range, low-power WAN protocol',
          architecture: {
            endDevices: 'Sensors and actuators',
            gateways: 'Network gateways',
            networkServer: 'Routing and security',
            applicationServer: 'Application logic'
          },
          classes: ['Class A', 'Class B', 'Class C']
        }
      },

      power: {
        sleepModes: {
          name: 'Sleep Mode Management',
          description: 'Power state management strategies',
          modes: {
            active: 'Full operation',
            idle: 'CPU stopped, peripherals active',
            standby: 'RAM retained, fast wake',
            deepSleep: 'Minimal power, slow wake',
            shutdown: 'Near zero power'
          },
          wakeupSources: ['RTC', 'External interrupt', 'Watchdog', 'UART'],
          strategies: ['Aggressive sleep', 'Predictive wake', 'Adaptive timing']
        },

        dutyCycling: {
          name: 'Duty Cycling',
          description: 'Periodic sleep-wake patterns',
          patterns: {
            fixed: 'Fixed intervals',
            adaptive: 'Based on activity',
            synchronized: 'Network synchronized',
            opportunistic: 'Sleep when idle'
          },
          optimization: 'Balance latency vs power'
        },

        energyHarvesting: {
          name: 'Energy Harvesting Integration',
          description: 'Self-powered operation patterns',
          sources: ['Solar', 'Vibration', 'Thermal', 'RF'],
          management: {
            storage: 'Supercapacitor or battery',
            prediction: 'Energy availability prediction',
            adaptation: 'Workload adaptation'
          }
        },

        powerGating: {
          name: 'Dynamic Power Gating',
          description: 'Selective component shutdown',
          techniques: {
            peripheral: 'Disable unused peripherals',
            clock: 'Clock gating',
            voltage: 'Dynamic voltage scaling',
            frequency: 'Dynamic frequency scaling'
          }
        }
      },

      memory: {
        staticAllocation: {
          name: 'Static Memory Allocation',
          description: 'Compile-time memory allocation',
          techniques: {
            arrays: 'Fixed-size arrays',
            placement: 'Placement new in C++',
            sections: 'Linker script sections'
          },
          benefits: ['Deterministic', 'No fragmentation', 'No heap overhead'],
          considerations: 'Fixed at compile time'
        },

        poolAllocator: {
          name: 'Memory Pool Pattern',
          description: 'Pre-allocated memory blocks',
          structure: {
            pools: 'Multiple pools of different sizes',
            blocks: 'Fixed-size memory blocks',
            freelist: 'Free block management'
          },
          benefits: ['Fast allocation', 'No fragmentation', 'Bounded time']
        },

        ringBuffer: {
          name: 'Ring Buffer Pattern',
          description: 'Circular buffer for data streaming',
          features: {
            lockFree: 'Single producer/consumer',
            overwrite: 'Oldest data overwrite',
            dma: 'DMA integration'
          },
          useCases: ['UART buffers', 'Audio streaming', 'Sensor data']
        },

        flashStorage: {
          name: 'Flash Storage Management',
          description: 'Non-volatile storage patterns',
          techniques: {
            wearLeveling: 'Distribute writes evenly',
            badBlock: 'Bad block management',
            powerLoss: 'Power loss protection',
            compression: 'Data compression'
          },
          filesystems: ['LittleFS', 'SPIFFS', 'FAT']
        }
      },

      realtime: {
        priorityInheritance: {
          name: 'Priority Inheritance',
          description: 'Prevent priority inversion',
          mechanism: 'Temporary priority elevation',
          implementation: 'Mutex with inheritance protocol'
        },

        rateMonotonic: {
          name: 'Rate Monotonic Scheduling',
          description: 'Fixed priority based on period',
          principle: 'Shorter period = higher priority',
          analysis: 'Utilization bound testing'
        },

        timePartitioning: {
          name: 'Time Partitioning',
          description: 'Guaranteed time slots',
          features: {
            majorFrame: 'Repeating schedule',
            minorFrame: 'Time slots',
            enforcement: 'Hardware timer enforcement'
          },
          standards: ['ARINC 653', 'DO-178C']
        },

        wcet: {
          name: 'WCET Analysis',
          description: 'Worst-case execution time',
          techniques: {
            static: 'Static code analysis',
            measurement: 'Empirical measurement',
            hybrid: 'Combined approach'
          },
          tools: ['AbsInt', 'Bound-T', 'SWEET']
        }
      },

      safety: {
        watchdog: {
          name: 'Watchdog Timer',
          description: 'System health monitoring',
          types: {
            hardware: 'Independent hardware timer',
            software: 'Task monitoring',
            window: 'Min/max timing window'
          },
          strategies: ['Kick pattern', 'Multi-stage', 'Task checking']
        },

        redundancy: {
          name: 'Redundancy Patterns',
          description: 'Fault tolerance through redundancy',
          types: {
            dmr: 'Dual Modular Redundancy',
            tmr: 'Triple Modular Redundancy',
            voting: 'Majority voting',
            lockstep: 'Lockstep execution'
          }
        },

        safeState: {
          name: 'Safe State Design',
          description: 'Fail-safe behavior',
          patterns: {
            failSafe: 'Safe default state',
            gracefulDegradation: 'Reduced functionality',
            limp: 'Limp home mode',
            emergency: 'Emergency shutdown'
          }
        }
      }
    };
  }

  getImplementationExample(pattern, platform) {
    const examples = {
      'rtos-task': {
        freertos: `
// FreeRTOS Task Example
void vSensorTask(void *pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = pdMS_TO_TICKS(100); // 100ms period

    for(;;) {
        // Read sensor
        sensor_data_t data = read_sensor();

        // Send to queue
        xQueueSend(xDataQueue, &data, portMAX_DELAY);

        // Wait for next period
        vTaskDelayUntil(&xLastWakeTime, xFrequency);
    }
}

// Create task
xTaskCreate(vSensorTask, "Sensor", 256, NULL, 2, &xSensorHandle);`,

        zephyr: `
// Zephyr RTOS Task
void sensor_thread(void *p1, void *p2, void *p3) {
    struct sensor_value val;
    const struct device *dev = DEVICE_DT_GET(DT_ALIAS(sensor0));

    while (1) {
        sensor_sample_fetch(dev);
        sensor_channel_get(dev, SENSOR_CHAN_ALL, &val);

        k_msgq_put(&sensor_queue, &val, K_NO_WAIT);
        k_sleep(K_MSEC(100));
    }
}

K_THREAD_DEFINE(sensor_tid, 512, sensor_thread,
                NULL, NULL, NULL, 7, 0, 0);`
      },

      'mqtt-client': {
        embedded: `
// Embedded MQTT Client
typedef struct {
    mqtt_client_t client;
    uint8_t sendbuf[256];
    uint8_t recvbuf[256];
} mqtt_context_t;

void mqtt_publish_sensor(mqtt_context_t *ctx, float value) {
    char payload[32];
    snprintf(payload, sizeof(payload), "{\\"value\\": %.2f}", value);

    mqtt_publish(&ctx->client,
                 "sensors/temperature",
                 payload, strlen(payload),
                 MQTT_QOS_1, false);
}

void mqtt_init(mqtt_context_t *ctx) {
    mqtt_client_init(&ctx->client);
    mqtt_set_broker(&ctx->client, "192.168.1.100", 1883);
    mqtt_set_buffers(&ctx->client, ctx->sendbuf,
                     sizeof(ctx->sendbuf), ctx->recvbuf,
                     sizeof(ctx->recvbuf));
    mqtt_connect(&ctx->client);
}`
      },

      'power-management': {
        stm32: `
// STM32 Power Management
void enter_low_power_mode(void) {
    // Configure wake-up source
    HAL_PWR_EnableWakeUpPin(PWR_WAKEUP_PIN1);

    // Enter stop mode
    HAL_SuspendTick();
    HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON,
                          PWR_STOPENTRY_WFI);

    // Resume after wake-up
    HAL_ResumeTick();
    SystemClock_Config(); // Restore clocks
}`,

        nordic: `
// Nordic nRF52 Power Management
void power_manage(void) {
    uint32_t err_code = sd_app_evt_wait();
    APP_ERROR_CHECK(err_code);
}

// System ON idle with RAM retention
void enter_system_on_idle(void) {
    __WFE();
    __SEV();
    __WFE();
}`
      }
    };

    return examples[pattern]?.[platform] || '';
  }
}

module.exports = EmbeddedPatterns;