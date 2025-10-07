/**
 * Machine Learning System Patterns
 * Architectural and design patterns for ML/AI applications
 */

class MLPatterns {
  constructor() {
    this.patterns = this._initializePatterns();
  }

  getAllPatterns() {
    return this.patterns;
  }

  selectPatterns(requirements, mlType) {
    const selected = {
      pipeline: [],
      serving: [],
      training: [],
      data: [],
      monitoring: []
    };

    // Pipeline patterns
    if (requirements.workflow === 'complex') {
      selected.pipeline.push(this.patterns.pipeline.dag);
      selected.pipeline.push(this.patterns.pipeline.featureStore);
    } else {
      selected.pipeline.push(this.patterns.pipeline.simple);
    }

    // Serving patterns based on deployment
    if (requirements.deployment === 'realtime') {
      selected.serving.push(this.patterns.serving.onlineServing);
      selected.serving.push(this.patterns.serving.modelCache);
    } else if (requirements.deployment === 'batch') {
      selected.serving.push(this.patterns.serving.batchInference);
    } else if (requirements.deployment === 'edge') {
      selected.serving.push(this.patterns.serving.edgeDeployment);
    }

    // Training patterns
    if (requirements.scale === 'distributed') {
      selected.training.push(this.patterns.training.distributedTraining);
    }

    if (requirements.continuous) {
      selected.training.push(this.patterns.training.continuousTraining);
      selected.training.push(this.patterns.training.onlineLearning);
    }

    // Data patterns
    if (requirements.dataVolume === 'large') {
      selected.data.push(this.patterns.data.dataLake);
      selected.data.push(this.patterns.data.streaming);
    }

    // Always include monitoring
    selected.monitoring.push(this.patterns.monitoring.modelMonitoring);
    selected.monitoring.push(this.patterns.monitoring.dataMonitoring);

    return selected;
  }

  _initializePatterns() {
    return {
      pipeline: {
        dag: {
          name: 'DAG Pipeline Pattern',
          description: 'Directed Acyclic Graph for ML workflows',
          components: {
            nodes: {
              dataIngestion: 'Load and validate data',
              preprocessing: 'Clean and transform',
              featureEngineering: 'Create features',
              training: 'Model training',
              evaluation: 'Model evaluation',
              deployment: 'Model deployment'
            },
            orchestration: {
              scheduler: 'Task scheduling',
              dependency: 'Dependency management',
              retry: 'Failure handling'
            }
          },
          frameworks: ['Airflow', 'Kubeflow', 'MLflow', 'Prefect', 'Dagster'],
          benefits: ['Reproducibility', 'Scalability', 'Monitoring']
        },

        featureStore: {
          name: 'Feature Store Pattern',
          description: 'Centralized feature management',
          components: {
            registry: 'Feature catalog and metadata',
            computation: 'Feature transformation engine',
            storage: {
              online: 'Low-latency serving',
              offline: 'Training data storage'
            },
            serving: 'Feature serving API'
          },
          capabilities: {
            versioning: 'Feature version control',
            lineage: 'Data lineage tracking',
            monitoring: 'Feature quality monitoring',
            sharing: 'Cross-team feature sharing'
          },
          frameworks: ['Feast', 'Tecton', 'Hopsworks', 'AWS SageMaker Feature Store']
        },

        simple: {
          name: 'Simple Pipeline',
          description: 'Basic sequential ML pipeline',
          stages: ['Data Load', 'Preprocess', 'Train', 'Evaluate', 'Deploy'],
          implementation: 'Script-based or notebook',
          suitable: 'Prototyping and simple models'
        },

        cicd: {
          name: 'ML CI/CD Pipeline',
          description: 'Continuous integration and deployment for ML',
          stages: {
            ci: {
              codeQuality: 'Linting and testing',
              dataValidation: 'Data quality checks',
              modelTesting: 'Unit and integration tests'
            },
            cd: {
              modelRegistry: 'Version and store models',
              staging: 'Stage deployment',
              production: 'Production deployment',
              rollback: 'Automatic rollback'
            }
          },
          tools: ['Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI']
        }
      },

      serving: {
        onlineServing: {
          name: 'Online Model Serving',
          description: 'Real-time inference serving',
          architecture: {
            loadBalancer: 'Request distribution',
            inferenceServer: 'Model execution',
            cache: 'Response caching',
            monitoring: 'Metrics collection'
          },
          patterns: {
            synchronous: 'Request-response',
            asynchronous: 'Queue-based',
            streaming: 'Stream processing'
          },
          frameworks: {
            tensorflow: 'TensorFlow Serving',
            pytorch: 'TorchServe',
            onnx: 'ONNX Runtime',
            triton: 'NVIDIA Triton',
            mlflow: 'MLflow Models'
          },
          optimization: {
            batching: 'Dynamic batching',
            caching: 'Prediction caching',
            quantization: 'Model quantization',
            pruning: 'Model pruning'
          }
        },

        batchInference: {
          name: 'Batch Inference Pattern',
          description: 'Large-scale offline predictions',
          components: {
            scheduler: 'Job scheduling',
            dataLoader: 'Batch data loading',
            inference: 'Parallel inference',
            writer: 'Result storage'
          },
          infrastructure: {
            compute: ['Spark', 'Dask', 'Ray'],
            storage: ['HDFS', 'S3', 'GCS'],
            orchestration: ['Airflow', 'Argo']
          },
          optimization: {
            partitioning: 'Data partitioning',
            parallelism: 'Parallel processing',
            checkpointing: 'Fault tolerance'
          }
        },

        edgeDeployment: {
          name: 'Edge ML Deployment',
          description: 'ML on edge devices',
          considerations: {
            constraints: ['Memory', 'Power', 'Compute'],
            optimization: ['Quantization', 'Pruning', 'Knowledge distillation']
          },
          frameworks: {
            mobile: ['TensorFlow Lite', 'Core ML', 'ML Kit'],
            embedded: ['TensorFlow Lite Micro', 'Edge Impulse'],
            browser: ['TensorFlow.js', 'ONNX.js']
          },
          patterns: {
            onDevice: 'Full on-device inference',
            hybrid: 'Edge with cloud fallback',
            federated: 'Federated learning'
          }
        },

        modelCache: {
          name: 'Model Caching Pattern',
          description: 'Efficient model loading and caching',
          levels: {
            disk: 'Persistent model storage',
            memory: 'In-memory model cache',
            gpu: 'GPU memory management'
          },
          strategies: {
            lazy: 'Load on first request',
            eager: 'Preload at startup',
            lru: 'Least recently used eviction'
          }
        },

        ensemble: {
          name: 'Ensemble Serving',
          description: 'Serve multiple models together',
          strategies: {
            voting: 'Majority voting',
            averaging: 'Average predictions',
            stacking: 'Meta-model combination',
            cascade: 'Sequential models'
          },
          routing: {
            static: 'Fixed routing rules',
            dynamic: 'Request-based routing',
            ab: 'A/B testing'
          }
        }
      },

      training: {
        distributedTraining: {
          name: 'Distributed Training',
          description: 'Scale training across multiple machines',
          strategies: {
            dataParallel: {
              description: 'Split data across workers',
              synchronization: ['Synchronous', 'Asynchronous'],
              frameworks: ['Horovod', 'PyTorch DDP', 'TF Distribution']
            },
            modelParallel: {
              description: 'Split model across devices',
              useCases: 'Large models exceeding memory',
              frameworks: ['GPipe', 'PipeDream', 'FairScale']
            },
            pipeline: {
              description: 'Pipeline model parallelism',
              benefits: 'Better GPU utilization'
            }
          },
          communication: {
            allReduce: 'Gradient aggregation',
            parameterServer: 'Central parameter storage',
            ring: 'Ring-based communication'
          }
        },

        continuousTraining: {
          name: 'Continuous Training Pattern',
          description: 'Automated model retraining',
          triggers: {
            scheduled: 'Time-based retraining',
            drift: 'Data drift detection',
            performance: 'Model degradation',
            data: 'New data availability'
          },
          pipeline: {
            dataValidation: 'Validate new data',
            training: 'Retrain model',
            evaluation: 'Compare with current',
            deployment: 'Deploy if better'
          },
          versioning: {
            data: 'Data versioning',
            model: 'Model versioning',
            code: 'Code versioning'
          }
        },

        onlineLearning: {
          name: 'Online Learning Pattern',
          description: 'Incremental model updates',
          algorithms: {
            sgd: 'Stochastic Gradient Descent',
            adaptive: 'Adaptive learning rates',
            ensemble: 'Online ensemble methods'
          },
          challenges: {
            stability: 'Catastrophic forgetting',
            drift: 'Concept drift',
            outliers: 'Outlier handling'
          },
          frameworks: ['River', 'Vowpal Wabbit', 'MOA']
        },

        federatedLearning: {
          name: 'Federated Learning',
          description: 'Training on distributed private data',
          components: {
            central: 'Central aggregator',
            clients: 'Local training nodes',
            communication: 'Secure aggregation'
          },
          frameworks: ['TensorFlow Federated', 'PySyft', 'FATE']
        },

        activelearning: {
          name: 'Active Learning Pattern',
          description: 'Selective data labeling',
          strategies: {
            uncertainty: 'Label uncertain samples',
            diversity: 'Label diverse samples',
            expectedGain: 'Maximum information gain'
          },
          workflow: {
            initial: 'Train on small labeled set',
            query: 'Select samples for labeling',
            label: 'Human annotation',
            retrain: 'Update model'
          }
        }
      },

      data: {
        dataLake: {
          name: 'ML Data Lake',
          description: 'Centralized data storage for ML',
          layers: {
            raw: 'Original data',
            cleaned: 'Processed data',
            features: 'Feature datasets',
            models: 'Training datasets'
          },
          formats: {
            structured: 'Parquet, ORC',
            unstructured: 'Images, text, audio',
            metadata: 'Data catalogs'
          },
          governance: {
            catalog: 'Data discovery',
            lineage: 'Data provenance',
            quality: 'Data quality metrics',
            privacy: 'Access control'
          }
        },

        streaming: {
          name: 'Stream Processing Pattern',
          description: 'Real-time data processing',
          components: {
            ingestion: 'Data ingestion',
            processing: 'Stream transformation',
            windowing: 'Time windows',
            sink: 'Output storage'
          },
          frameworks: {
            kafka: 'Kafka Streams',
            flink: 'Apache Flink',
            spark: 'Spark Streaming',
            beam: 'Apache Beam'
          },
          patterns: {
            lambda: 'Batch + Stream',
            kappa: 'Stream-only',
            delta: 'Multi-layer architecture'
          }
        },

        dataVersion: {
          name: 'Data Versioning Pattern',
          description: 'Version control for datasets',
          tools: ['DVC', 'Pachyderm', 'LakeFS', 'Delta Lake'],
          features: {
            versioning: 'Dataset versions',
            branching: 'Data branches',
            lineage: 'Data lineage',
            reproducibility: 'Experiment reproducibility'
          }
        },

        syntheticData: {
          name: 'Synthetic Data Pattern',
          description: 'Generate training data',
          techniques: {
            augmentation: 'Data augmentation',
            generation: 'GANs, VAEs',
            simulation: 'Physics simulation',
            privacy: 'Differential privacy'
          },
          useCases: ['Privacy preservation', 'Data scarcity', 'Edge cases']
        }
      },

      monitoring: {
        modelMonitoring: {
          name: 'Model Monitoring Pattern',
          description: 'Production model monitoring',
          metrics: {
            performance: {
              accuracy: 'Prediction accuracy',
              latency: 'Inference time',
              throughput: 'Requests per second'
            },
            drift: {
              data: 'Input distribution shift',
              concept: 'Target distribution shift',
              prediction: 'Output distribution shift'
            },
            business: {
              impact: 'Business metrics',
              fairness: 'Bias detection',
              explainability: 'Model explanations'
            }
          },
          tools: ['Evidently', 'WhyLabs', 'Arize', 'Amazon SageMaker Model Monitor']
        },

        dataMonitoring: {
          name: 'Data Quality Monitoring',
          description: 'Monitor data pipeline quality',
          checks: {
            schema: 'Schema validation',
            statistics: 'Statistical properties',
            anomalies: 'Anomaly detection',
            completeness: 'Missing data'
          },
          tools: ['Great Expectations', 'Deequ', 'TensorFlow Data Validation']
        },

        experimentTracking: {
          name: 'Experiment Tracking',
          description: 'Track ML experiments',
          components: {
            parameters: 'Hyperparameters',
            metrics: 'Performance metrics',
            artifacts: 'Models and data',
            environment: 'Dependencies'
          },
          platforms: ['MLflow', 'Weights & Biases', 'Neptune', 'Comet ML']
        },

        alerting: {
          name: 'ML Alerting Pattern',
          description: 'Alert on model issues',
          triggers: {
            threshold: 'Metric thresholds',
            anomaly: 'Anomaly detection',
            trend: 'Trend analysis'
          },
          channels: ['Email', 'Slack', 'PagerDuty'],
          actions: ['Rollback', 'Retrain', 'Manual review']
        }
      },

      deployment: {
        blueGreen: {
          name: 'Blue-Green Deployment',
          description: 'Zero-downtime model updates',
          process: {
            blue: 'Current production',
            green: 'New version',
            switch: 'Traffic switching',
            rollback: 'Quick rollback'
          }
        },

        canary: {
          name: 'Canary Deployment',
          description: 'Gradual rollout',
          stages: {
            initial: 'Small traffic percentage',
            monitor: 'Performance monitoring',
            expand: 'Increase traffic',
            complete: 'Full deployment'
          }
        },

        shadow: {
          name: 'Shadow Deployment',
          description: 'Parallel model testing',
          implementation: {
            production: 'Serving model',
            shadow: 'Test model',
            comparison: 'Compare outputs',
            logging: 'Log differences'
          }
        },

        multiArm: {
          name: 'Multi-Armed Bandit',
          description: 'Dynamic model selection',
          algorithms: ['Epsilon-greedy', 'Thompson sampling', 'UCB'],
          useCases: ['A/B testing', 'Model selection', 'Feature testing']
        }
      }
    };
  }

  getImplementationExample(pattern, framework) {
    const examples = {
      'feature-store': {
        feast: `
# Feast Feature Store Example
from feast import FeatureStore, Entity, Feature, FeatureView, FileSource
from feast.types import Float32, Int64
from datetime import timedelta

# Define entity
driver = Entity(name="driver_id", value_type=Int64)

# Define data source
driver_stats_source = FileSource(
    path="/data/driver_stats.parquet",
    event_timestamp_column="event_timestamp",
)

# Define feature view
driver_stats_fv = FeatureView(
    name="driver_stats",
    entities=["driver_id"],
    ttl=timedelta(days=1),
    features=[
        Feature(name="trips_today", dtype=Float32),
        Feature(name="rating", dtype=Float32),
    ],
    online=True,
    batch_source=driver_stats_source,
)

# Usage
store = FeatureStore(repo_path=".")
features = store.get_online_features(
    features=["driver_stats:trips_today", "driver_stats:rating"],
    entity_rows=[{"driver_id": 1001}],
).to_dict()`,

        custom: `
# Custom Feature Store Pattern
class FeatureStore:
    def __init__(self):
        self.online_store = RedisClient()
        self.offline_store = S3Client()
        self.registry = FeatureRegistry()

    def get_online_features(self, entity_ids, feature_names):
        """Get features for real-time serving"""
        features = {}
        for name in feature_names:
            key = f"{name}:{entity_ids}"
            features[name] = self.online_store.get(key)
        return features

    def get_training_data(self, entity_ids, feature_names, start_date, end_date):
        """Get historical features for training"""
        query = self._build_query(entity_ids, feature_names, start_date, end_date)
        return self.offline_store.query(query)

    def materialize(self, feature_view, start_date, end_date):
        """Materialize features from offline to online store"""
        data = self.offline_store.read(feature_view.source)
        transformed = feature_view.transform(data)
        self.online_store.write_batch(transformed)`
      },

      'model-serving': {
        fastapi: `
# FastAPI Model Serving
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import numpy as np

app = FastAPI()

# Load model at startup
model = None

@app.on_event("startup")
async def load_model():
    global model
    model = joblib.load("model.pkl")

class PredictionRequest(BaseModel):
    features: list[float]

class PredictionResponse(BaseModel):
    prediction: float
    confidence: float

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    try:
        features = np.array(request.features).reshape(1, -1)
        prediction = model.predict(features)[0]
        confidence = model.predict_proba(features).max()

        return PredictionResponse(
            prediction=prediction,
            confidence=confidence
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))`,

        triton: `
# NVIDIA Triton Inference Server Config
name: "my_model"
platform: "tensorflow_savedmodel"
max_batch_size: 32
input [
  {
    name: "input"
    data_type: TYPE_FP32
    dims: [ 224, 224, 3 ]
  }
]
output [
  {
    name: "predictions"
    data_type: TYPE_FP32
    dims: [ 1000 ]
  }
]
instance_group [
  {
    count: 2
    kind: KIND_GPU
  }
]
dynamic_batching {
  preferred_batch_size: [ 16, 32 ]
  max_queue_delay_microseconds: 100
}`
      },

      'monitoring': {
        drift: `
# Data Drift Monitoring
import numpy as np
from scipy import stats
from typing import Dict, Any

class DriftMonitor:
    def __init__(self, reference_data):
        self.reference_data = reference_data
        self.reference_stats = self._compute_stats(reference_data)

    def detect_drift(self, current_data, threshold=0.05) -> Dict[str, Any]:
        drift_results = {}

        for column in self.reference_data.columns:
            ref_col = self.reference_data[column]
            curr_col = current_data[column]

            if ref_col.dtype == 'object':
                # Categorical: Chi-square test
                chi2, p_value = self._chi_square_test(ref_col, curr_col)
                drift_detected = p_value < threshold
            else:
                # Numerical: Kolmogorov-Smirnov test
                ks_stat, p_value = stats.ks_2samp(ref_col, curr_col)
                drift_detected = p_value < threshold

            drift_results[column] = {
                'drift_detected': drift_detected,
                'p_value': p_value,
                'reference_mean': ref_col.mean() if ref_col.dtype != 'object' else None,
                'current_mean': curr_col.mean() if curr_col.dtype != 'object' else None
            }

        return drift_results

    def _compute_stats(self, data):
        return {
            'means': data.mean(),
            'stds': data.std(),
            'quantiles': data.quantile([0.25, 0.5, 0.75])
        }`
      }
    };

    return examples[pattern]?.[framework] || '';
  }
}

module.exports = MLPatterns;