/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Export and import data in various formats.
   */
  var ImportExportWidget = function(options) {
    options = options || {};
    this.containers = {};
    this.mode = "export";
    this.showImports = CATMAID.tools.getDefined(options.showImports,
        CATMAID.hasPermission(project.id, 'can_import'));

    this.modes = ['export'];
    if (this.showImports) {
      this.modes.push('import-files');
      this.modes.push('import-catmaid');
      this.modes.push('import-tracing-layer');
    }

    this.sourceRemote = '';
    this.sourceProject = project.id;
    this.importCatmaidResult = null;
    this.importAnnotations = CATMAID.TracingTool.getDefaultImportAnnotations();
  };

  ImportExportWidget.exportContentTemplate = `
<h3>Export Graph</h3>

The selected skeletons from the <i>Selection Table</i> are used to extract the subnetwork (in different formats) or
summary statistics.

<ul>

  <li><a id='export-swc' href='#'><strong>SWC</strong></a><br />
    Export active skeleton as SWC file.</li>

  <li><a id='export-nrrd' href='#'><strong>NRRD</strong></a><br />
    Export active skeleton as NRRD file using the NAT R package.</li>

  <li><a id='export-networkx' href='#'><strong>NetworkX JSON graph</strong></a><br />
    Using Python and <a href target='_new' href='http://networkx.github.io/documentation/latest/reference/readwrite.json_graph.html'>NetworkX</a>, you can import the returned file in your Python shell for further analysis.<br />
    <pre>
    import networkx as nx
    from networkx.readwrite import json_graph
    g=json_graph.load(open('my_downloaded_file.json'))
    g.nodes(data=True)
    g.edges(data=True)
    nx.write_graphml( g, 'mynetwork.graphml' )
    </pre></li>

  <li><a id='export-neuroml181' href='#'><strong>NeuroML 1.8.1 (Level 3, NetworkML)</strong></a></br />
  For modeling with <a href="http://www.neuroconstruct.org/">neuroConstruct</a> and then e.g. the <a href="http://www.neuron.yale.edu/neuron/">NEURON</a> simulator.</li>

</ul>

In addition, it is possible to extract the tree nodes or only the connectors of
the selected neurons.

<ul>
  <li>
    <a id='export-treenode-archive' href='#'>
            <strong>Treenode archive</strong></a><br />
    The generated <em>tar.gz</em> archive contains one folder for every
    selected neuron, named after its ID. Such a folder contains image files for
    every treenode of the neuron's skeleton(s), named <em>treenode-id.tiff</em>.
    Along those files a meta data file, named <em>metadata.csv</em>, is created.
    It contains a table with meta data for every treenode ID (first column). The
    remaining columns are <em>parent-id</em>, <em># presynaptic sites</em>,
    <em># postsynaptic sites</em>, <em>x</em>, <em>y</em> and <em>z</em>. The
    root node has no parent and its entry will have <em>null</em> in the
    corresponding field in the meta data file.
  </li>
  <li>
    <a id='export-connector-archive' href='#'>
            <strong>Connector archive</strong></a><br />
    The generated <em>tar.gz</em> archive contains one folder for every
    selected neuron, named after its ID. Such a folder contains two folders:
    <em>presynaptic</em> and <em>postsynaptic</em> for the respective connector
    types. These in turn contain one folder for each connector, named after
    their ID. The actual images are stored in such a connector folder. They are
    named <em>x_y_z.tiff</em> and encode the image center coordinates in their
    name.
  </li>
  <li>
    <a id='export-tree-geometry' href='#'>
            <strong>Treenode and connector geometry</strong></a><br />
    The generated JSON file contains location and tree information for all
    treenodes in the selected neurons, as well as for all connector nodes
    presynaptic or postsynaptic to the selected neurons.
  </li>
</ul>
`;

  ImportExportWidget.importContentTemplate = `
<h3>Import skeleton from SWC</h3>
<p>
Select an SWC file to import a skeleton. This does <em>not</em> include
annotations, neuron name, connectors or partner neurons.
</p>

<p>
<label>SWC file: <input type="file" accept=".swc" multiple data-role="swc-import-file" />
</p>
<p>
<button data-role="import-swc">Import SWC file(s)</button>
</p>
 `;

  ImportExportWidget.prototype.getName = function() {
    if (this.showImports) {
      return "Import export widget";
    } else {
      return "Export widget";
    }
  };

  ImportExportWidget.prototype.getWidgetConfiguration = function() {
    return {
      createControls: function(controls) {
        let tabNames = this.modes.map(m => ImportExportWidget.Modes[m].title);
        var tabs = CATMAID.DOM.addTabGroup(controls, 'import_export_controls',
            tabNames);

        this.modes.forEach((m, i) => {
          let mode = ImportExportWidget.Modes[m];
          let tab = tabs[mode.title];
          tab.dataset.mode = m;
          tab.dataset.index = i;
          CATMAID.DOM.appendToTab(tab, mode.createControls(this));
        });

        // Initialize tabs
        var self = this;
        let tabControls = $(controls).tabs({
          activate: function(event, ui) {
            var mode = ui.newPanel.attr('data-mode');
            if (self.modes.indexOf(mode) !== -1) {
              self.mode = mode;
              self.redraw();
            } else {
              CATMAID.warn('Unknown import export table mode: ' + mode);
            }
          }
        });
      },
      createContent: function(container) {
        var $container = $(container);

        this.modes.forEach(m => {
          let mode = ImportExportWidget.Modes[m];
          this.containers[m] = container.appendChild(document.createElement('div'));
          mode.createContent(this.containers[m], this);
        });

        // Make default tab visible
        this.redraw();
      }
    };
  };

  /**
   * Redraw the complete import/export table and manage visibility.
   */
  ImportExportWidget.prototype.redraw = function() {
    for (var containerName in this.containers) {
      let container = this.containers[containerName];

      if (containerName === this.mode) {
        container.style.display = 'block';
        delete container.dataset.msg;
        let mode = ImportExportWidget.Modes[this.mode];
        if (mode && CATMAID.tools.isFn(mode.update)) {
          mode.update(container, this);
        }
      } else {
        container.style.display = 'none';
      }
    }
  };

  ImportExportWidget.prototype.getEffectiveAnnotations = function() {
    return CATMAID.TracingTool.substituteVariables(this.importAnnotations, {
      'group': CATMAID.userprofile.primary_group_id !== undefined && CATMAID.userprofile.primary_group_id !== null ?
          CATMAID.groups.get(CATMAID.userprofile.primary_group_id) : CATMAID.session.username,
      'source': this.sourceRemote ? this.sourceRemote : 'local',
    });
  };

  /**
   * Show a confirmation dialog for all passed in skeletons and initiate the
   * import of them.
   */
  ImportExportWidget.prototype.importRemoteSkeletons = function(skeletonIds, annotations) {
    let api = CATMAID.Remote.getAPI(this.sourceRemote);
    let entityMap = this.importCatmaidResult.resultEntities.reduce((o,e) => {
      for (let i=0; i<e.skeleton_ids.length; ++i) {
        o[e.skeleton_ids[i]] = e;
      }
      return o;
    }, {});
    let sourceProjectId = this.sourceProject;

    return this._importRemoteSkeletons(api, this.sourceProject, skeletonIds, annotations, entityMap);
  };

  ImportExportWidget.prototype._importRemoteSkeletons = function(api,
      sourceProjectId, skeletonIds, annotations, entityMap) {
    let plural = skeletonIds.length > 0 ? 's' : '';
    let title = `Please confirm the import of the following skeleton${plural}`;
    let self = this;
    CATMAID.Remote.previewSkeletons(sourceProjectId, skeletonIds, {
        api: api,
        title: title,
        buttons: {
          'Confirm import': function() {
            // Initate import
            CATMAID.Remote.importSkeletons(sourceProjectId, project.id, skeletonIds, {
                getMeta: (skeletonId) => {
                  let e = entityMap[skeletonId];
                  if (!e) {
                    throw new CATMAID.ValueError("No skeleton meta data found");
                  }
                  return {
                    'name': e.name,
                    'annotations': annotations,
                  };
                },
                api: api,
              })
              .then(result => {
                self.redraw();
              })
              .catch(CATMAID.handleError);
            $(this).dialog("destroy");
          },
          'Cancel': function() {
            $(this).dialog("destroy");
          }
        }
      })
      .catch(CATMAID.handleError);
  };

  ImportExportWidget.Modes = {
    'export': {
      title: 'Export',
      createControls: widget => [],
      createContent: function(container, widget) {
        container.innerHTML = ImportExportWidget.exportContentTemplate;
        let $container = $(container);

        // Bind SWC export handler
        $container.find('#export-swc').click(export_swc);

        // Bind NRRD export handler
        $container.find('#export-nrrd').click(export_nrrd);

        // Bind NetworkX JSON link to handler
        $container.find('#export-networkx').click(function() {
          graphexport_nxjson();
        });
        // Bind NeuroML link to handler
        $container.find('#export-neuroml181').click(function() {
          graphexport_NeuroML181();
        });
        // Bind treenode export link to handler
        $container.find('#export-treenode-archive').click(function() {
          export_treenodes();
        });
        // Bind connector export link to handler
        $container.find('#export-connector-archive').click(function() {
          export_connectors();
        });
        // Bind tree geometry export link to handler
        $container.find('#export-tree-geometry').click(function() {
          export_tree_geometry();
        });
      },
    },

    'import-files': {
      title: 'Import from files',
      createControls: widget => [],
      createContent: function(container, widget) {
        container.innerHTML = ImportExportWidget.importContentTemplate;

        // Add some bindings
        var $importContainer = $(container);
        $importContainer.find('button[data-role=import-swc]').click(function() {
          var button = $(this);
          button.prop('disabled', true);
          var fileInput = $importContainer.find('input[data-role=swc-import-file]');
          if (fileInput.length === 0) {
            CATMAID.warn("No SWC file input found");
            return;
          }
          var files = fileInput[0].files;
          var importedFiles = new Map();
          var failedImports = new Map();
          var importQueue = Promise.resolve();
          for (let i=0; i<files.length; ++i) {
            let file = files[i];
            importQueue = importQueue
              .then(function() {
                return import_swc(file)
                  .then(function(data) {
                    CATMAID.msg("SWC successfully imported", "Neuron ID:" +
                        data.neuron_id + " Skeleton ID: " + data.skeleton_id);
                    importedFiles.set(file.name, data);
                    if (files.length === 1) {
                      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton(
                        'skeleton', data.skeleton_id);
                    }
                  })
                  .catch(function(error) {
                    CATMAID.warn("SWC not imported: " + file.name);
                    failedImports.set(file.name, error);
                  });
              });
          }

          importQueue
            .then(function() {
              if (failedImports.size === 0) {
                CATMAID.msg("Success", "Imported " + importedFiles.size + " neurons");
              } else {
                var msg;
                if (importedFiles === 0) {
                  msg = "Could not import any selected SWC file";
                } else {
                  msg = "Some SWC files could not be imported";
                }
                var details = [];
                for (var [key, value] of failedImports.entries()) {
                  details.push("File: " + key + " Error: " + value.error);
                }
                CATMAID.error(msg, details.join("\n"));
              }
            })
            .catch(CATMAID.handleError)
            .then(function() {
              button.prop('disabled', false);
            });
        });
      },
    },

    'import-catmaid': {
      title: 'Import from CATMAID',
      createControls: widget => {

        // The currently selected source CATMAID instance, for CATMAID based import.
        widget.sourceRemote = '';
        widget.sourceProject = project.id;
        let sourceNeuronAnnotation = '';

        let searchSection = document.createElement('span');
        searchSection.classList.add('section-header');
        searchSection.appendChild(document.createTextNode('Search'));

        // Remote select
        let remoteSelect = CATMAID.Remote.createRemoteSelect(widget.sourceRemote, true,
            'Source instance', e => {
              widget.sourceRemote = e.target.value;
              widget.sourceProject = null;
              // Try to get all projects from the selected remote and update the
              // displayed project options.
              updateProjectList();
              updateAnnotationTitle();
            });

        let remoteSelectWrapper = CATMAID.DOM.wrapInLabel("Source remote",
            remoteSelect, "Select the source CATMAID instance that contains " +
            "the source skeletons. The current remote is selected by default.");

        // Project select
        var projectSelectSettingWrapper = document.createElement('span');
        var updateProjectList = function() {
          while (projectSelectSettingWrapper.lastChild) {
            projectSelectSettingWrapper.removeChild(projectSelectSettingWrapper.lastChild);
          }
          let asyncProjectList = CATMAID.Remote.createAsyncProjectSelect(widget.sourceRemote,
              widget.sourceProject, undefined, e => {
                widget.sourceProject = parseInt(e.target.value, 10);

                // If the source project is the current project, the regular source
                // select and source group select are shown. Otherwise hidden.
                let currentProjectMode = widget.sourceProject == project.id ? 'block' : 'none';
              });
          let projectSelect = CATMAID.DOM.createAsyncPlaceholder(asyncProjectList);
          let projectSelectWrapper = CATMAID.DOM.wrapInLabel("Source project",
              projectSelect, "Select the project that contains the source " +
              "skeletons. The current project is selected by default.");
          projectSelectSettingWrapper.appendChild(projectSelectWrapper);
        };

        // Init project list for current project
        updateProjectList();

        // Add table with remote skeletons
        let resultSection = document.createElement('span');
        resultSection.classList.add('section-header');
        resultSection.appendChild(document.createTextNode('Results'));

        // TODO: Add active 3D viewers selector

        let nameFilter = '';
        let annotationFilter = '';
        let withSubAnnotations = false;

        let user = CATMAID.User.safe_get(CATMAID.session.userid);

        let getAnnotationTitle = function() {
          let annotations = widget.getEffectiveAnnotations().join(', ');
          return `A set of annotations, separated by comma, that will be added to the import skeletons. Every occurence of "{group}" will be replaced with your primary group (or your username, should now primary group be defined). Every occurence of "{source}" will be replaced with the handle of the import source (e.g. the server name).\n\nCurrent set of annotations: ${annotations}`;
        };

        var updateAnnotationTitle = function() {
          let target = document.getElementById(`import-annotations-${widget.widgetID}`);
          target.title = getAnnotationTitle();
        };

        return [{
            type: 'child',
            element: searchSection,
          },
          {
            type: 'child',
            element: remoteSelectWrapper,
          },
          {
            type: 'child',
            element: projectSelectSettingWrapper,
          },
          {
            type: 'text',
            label: 'Name',
            placeholder: 'Use / for RegEx',
            onchange: e => {
              nameFilter = e.target.value;
            },
          },
          {
            type: 'text',
            label: 'Annotation',
            onchange: e => {
              annotationFilter = e.target.value;
            },
          },
          {
            type: 'checkbox',
            label: 'Incl. sub-annotations',
            onchange: e => {
              withSubAnnotations = e.target.checked;
            },
          },
          {
            type: 'button',
            label: 'Search neurons',
            onclick: e => {
              if ((!nameFilter || nameFilter.length === 0) &&
                  (!annotationFilter || annotationFilter.length === 0)) {
                CATMAID.warn("Need name or annotation to search");
                return;
              }
              let api = CATMAID.Remote.getAPI(widget.sourceRemote);
              CATMAID.Skeletons.search(widget.sourceProject, {
                name: nameFilter,
                annotations: [annotationFilter],
                withSubAnnotations: withSubAnnotations,
              }, api)
              .then(result => {
                if (!result || !result.skeletonIds || result.skeletonIds.length === 0) {
                  CATMAID.msg("Could not find any skeletons");
                  return;
                }
                widget.importCatmaidResult = result;

                // Add selection information
                result.resultEntities.forEach((e, i) => {
                  e.index = i;
                  e.selected = true;
                  e.localSkeletonId = undefined;
                });
                CATMAID.msg('Success', `Found ${result.skeletonIds.length} remote skeletons`);

                // Redraw result content
                widget.redraw();
              })
              .catch(CATMAID.handleError);
            },
          },
          {
            type: 'child',
            element: resultSection,
          },
          {
            type: 'text',
            id: `import-annotations-${widget.widgetID}`,
            label: 'Annotations',
            length: 15,
            title: getAnnotationTitle(),
            value: widget.importAnnotations,
            onchange: e => {
              widget.importAnnotations = e.target.value.split(',').map(v => v.trim());
              updateAnnotationTitle();
            },
          },
          {
            type: 'button',
            label: 'Preview selected',
            title: "Preview all selected result skeletons",
            onclick: e => {
              if (!widget.importCatmaidResult) {
                CATMAID.warn("No remote skeletons queried yet. Please search remote skeletons first.");
                return;
              }
              let skeletonIds = widget.importCatmaidResult.resultEntities.reduce((l, e) => {
                if (e.selected) {
                  Array.prototype.push.apply(l, e.skeleton_ids);
                }
                return l;
              }, []);
              CATMAID.Remote.previewSkeletons(widget.sourceProject, skeletonIds, {
                  api: CATMAID.Remote.getAPI(widget.sourceRemote),
                  title: "The following skeletons can be imported",
                })
                .catch(CATMAID.handleError);
            },
          },
          {
            type: 'button',
            label: 'Import selected',
            title: "Import all selected result skeletons",
            onclick: e => {
              let skeletonIds = widget.importCatmaidResult.resultEntities.reduce((l, e) => {
                if (e.selected) {
                  Array.prototype.push.apply(l, e.skeleton_ids);
                }
                return l;
              }, []);

              widget.importRemoteSkeletons(skeletonIds, getEffectiveAnnotations());
            },
          },
        ];
      },
      createContent: function(container, widget) {
        if (!widget.importCatmaidResult) {
          container.msg = 'Please search for a set of remote skeletons';
          return;
        }
        let skeletonIds = widget.importCatmaidResult.skeletonIds;
        if (!skeletonIds || skeletonIds.length === 0) {
          container.msg = 'Could not find any skeletons matching your query.';
          return;
        }

        let api = widget.sourceRemote ? CATMAID.Remote.getAPI(widget.sourceRemote) : null;
        let getRemoteUrl = function(skeletonId) {
          if (widget.sourceRemote && widget.sourceProject) {
            return CATMAID.tools.urlJoin(api.url, CATMAID.Client.createRelativeDeepLink(widget.sourceProject, {
              skeletonId: skeletonId,
              tool: 'tracingtool',
            }));
          }
          return '#';
        };

        // Create datatable with results
        let table = container.appendChild(document.createElement('table'));
        table.style.width = '100%';
        let datatable = $(table).DataTable({
          //dom: 'th<ip>',
          dom: 'lfrtip',
          order: [],
          data: widget.importCatmaidResult.resultEntities,
          language: {
            info: "Showing _START_ to _END_  of _TOTAL_ remote skeleton(s)",
            infoFiltered: "(filtered from _MAX_ total remote skeletons(s))",
            emptyTable: 'No remote skeletons found',
            zeroRecords: 'No remote skeletons found'
          },
          columns: [{
            data: 'id',
            render: function(data, type, row, meta) {
              let checked = row.selected ? 'checked=checked' : '';
              return `<label><input type="checkbox" data-action="select-import" ${checked}/></label>`;
            },
          }, {
            data: 'name',
            title: 'Remote neuron name',
          }, {
            data: 'skeleton_ids',
            title: 'Remote skeleton ID',
            class: 'cm-center',
            render: function(data, type, row, meta) {
              return data.join(', ');
            },
          }, {
            title: 'Local skeleton ID',
            class: 'cm-center',
            render: function(data, type, row, meta) {
              if (row.localSkeletonId) {
                return `<a href="#" data-action="select-local-skeleton">${row.localSkeletonId}</a>`;
              }
              return '-';
            },
          }, {
            title: 'Action',
            render: function(data, type, row, meta) {
              let remoteUrl = getRemoteUrl(row.skeleton_ids[0]);
              return `<ul class="resultTags"><li><a href="#" data-action="preview-skeleton">Preview</a></li><li><a href="#" data-action="import-skeleton">Import</a></li><li><a href="${remoteUrl}" target="_blank">Open remotely</a></li></ul>`;
            },
          }],
        });

        datatable.on('change', 'input[data-action=select-import]', function(e) {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          // Uncheck in data, no need to refresh the table.
          data.selected = this.checked;
          widget.importCatmaidResult.resultEntities[data.index].selected = this.checked;
        });

        datatable.on('click', 'a[data-action=preview-skeleton]', function(e) {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          // Preview single skeleton
          CATMAID.Remote.previewSkeletons(widget.sourceProject, data.skeleton_ids, {
              api: CATMAID.Remote.getAPI(widget.sourceRemote),
            })
            .catch(CATMAID.handleError);
        });

        datatable.on('click', 'a[data-action=import-skeleton]', function(e) {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          // Import single skeleton
          widget.importRemoteSkeletons(data.skeleton_ids, widget.getEffectiveAnnotations());
        });

        datatable.on('click', 'a[data-action=select-local-skeleton]', function(e) {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          // Import single skeleton
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', data.localSkeletonId);
        });

        // Fetch origin information
        if (api) {
          CATMAID.fetch({
              url: project.id + '/skeletons/from-origin',
              method: 'POST',
              data: {
                'source_ids': skeletonIds,
                'source_url': api.url,
                'source_project_id': widget.sourceProject,
              },
              parallel: true,
            })
            .then(result => {
              if (CATMAID.tools.isEmpty(result)) {
                return;
              }
              let entityMap = widget.importCatmaidResult.resultEntities.reduce((o,e) => {
                for (let i=0; i<e.skeleton_ids.length; ++i) {
                  o[e.skeleton_ids[i]] = e;
                }
                return o;
              }, {});
              for (let sourceId in result) {
                let queryResult = entityMap[sourceId];
                if (queryResult) {
                  queryResult.localSkeletonId = result[sourceId];
                }
              }
              datatable.rows().invalidate();
            })
            .catch(CATMAID.handleError);
        }
      },
      update: function(container, widget) {
        // Clear content and recreate
        while (container.lastChild) {
          container.removeChild(container.lastChild);
        }
        ImportExportWidget.Modes['import-catmaid'].createContent(container, widget);
      },
    },

    'import-tracing-layer': {
      title: 'Import from tracing layer',
      createControls: widget => {
        return [{
            type: 'button',
            label: 'Preview active skeleton',
            title: "Preview active skeletons if it is a remote skeleton",
            onclick: e => {
              let activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
              let projectId = SkeletonAnnotations.getActiveProjectId();
              let api = SkeletonAnnotations.getActiveSkeletonAPI();

              if (!activeSkeletonId) {
                CATMAID.warn("No skeleton selected");
                return;
              }

              if (!api) {
                CATMAID.warn("The selected skeleton is already a local skeleton");
                return;
              }
              CATMAID.Remote.previewSkeletons(projectId, [activeSkeletonId], {
                  api: api,
                  title: "The active skeletons can be imported",
                })
                .catch(CATMAID.handleError);
            },
          },
          {
            type: 'button',
            label: 'Import active skeleton',
            title: "Import active skeleton if it is a remote skeleton",
            onclick: e => {
              let activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
              let projectId = SkeletonAnnotations.getActiveProjectId();
              let api = SkeletonAnnotations.getActiveSkeletonAPI();

              if (!activeSkeletonId) {
                CATMAID.warn("No skeleton selected");
                return;
              }

              if (!api) {
                CATMAID.warn("The selected skeleton is already a local skeleton");
                return;
              }

              // Load this skeleton and import it
              CATMAID.Skeletons.getNames(projectId, [activeSkeletonId], api)
                .then(names => {
                  let entityMap = {};
                  entityMap[activeSkeletonId] = {
                    name: names[activeSkeletonId],
                  };

                  widget._importRemoteSkeletons(api, projectId, [activeSkeletonId],
                      widget.getEffectiveAnnotations(), entityMap);
                })
                .catch(CATMAID.handleError);
            },
          },
        ];
      },
      createContent: function(container, widget) {

      },
    },
  };

  function new_window_with_return( url ) {
    var selectionTables = CATMAID.SelectionTable.prototype.getInstances();
    if (0 === selectionTables.length) {
      alert("Open and populate a Selection Table first!");
      return;
    }
    var dialog = new CATMAID.OptionsDialog("Export NetworkX");
    var choiceST = dialog.appendChoice("Source: ", "neuroml-st",
        selectionTables.map(function(item) { return item.getName(); }),
        selectionTables.map(function(item, i) { return i; }),
        0);

    dialog.onOK = function() {
      jQuery.ajax({
        url: CATMAID.makeURL(project.id + url),
        type: "POST",
        dataType: "text",
        data: { skeleton_list: selectionTables[choiceST.selectedIndex].getSelectedSkeletons() },
        success: function (data) {
          var blob = new Blob([data], {type: "text/plain"});
          saveAs(blob, "networkx_graph.json");
        }
      });
    };
    dialog.show();
  }

  function import_swc(file, autoSelect) {
    if (!file) {
      return Promise.reject(new CATMAID.ValueError("Need file"));
    }

    var data = new FormData();
    data.append('file', file);
    return new Promise(function(resolve, reject) {
      $.ajax({
          url : CATMAID.makeURL(project.id + "/skeletons/import"),
          processData : false,
          contentType : false,
          type : 'POST',
          data : data,
      }).done(function(data) {
          if (data.skeleton_id) {
            resolve(data);
          } else {
            reject(data);
          }
      });
    });
  }

  function export_swc() {
    // Add skeleton source message and controls
    var dialog = new CATMAID.OptionsDialog('Export SWC');

    // Add user interface
    dialog.appendMessage('Please select a source from where to get the ' +
        'skeletons which should be exported.');
    var select = document.createElement('select');
    CATMAID.skeletonListSources.createOptions().forEach(function(option, i) {
      select.options.add(option);
      if (option.value === 'Active skeleton') select.selectedIndex = i;
    });
    var label_p = document.createElement('p');
    var label = document.createElement('label');
    label.appendChild(document.createTextNode('Source:'));
    label.appendChild(select);
    label_p.appendChild(label);
    dialog.dialog.appendChild(label_p);

    var createArchive = dialog.appendCheckbox('Create Zip archive',
        'zip-archive', true);
    var linearizeIds = dialog.appendCheckbox('Linearize IDs',
        'linearize-ids', true,
        "Replace original node IDs with incremental IDs starting from one.");

    dialog.appendMessage("Optionally, soma nodes can be marked in the exported " +
        "SWC files. This can be done either by using soma tags, large nodes or " +
        "root nodes. If multiple options are selected, they take precedence in " +
        "this order.");

    let somaTag = dialog.appendCheckbox('Mark "soma" tagged nodes as soma',
        'soma-tag', true);
    let somaRadius = dialog.appendCheckbox('Mark nodes larger than radius below as soma',
        'soma-radius', false);
    let somaRadiusVal = dialog.appendField('Soma radius', 'swc-export-soma-radius', 0, false);
    somaRadiusVal.setAttribute('disabled', 'disabled');
    let somaRoot = dialog.appendCheckbox('Mark root nodes as soma',
        'soma-root', false);

    somaRadius.onchange = function() {
      if (this.checked) {
        somaRadiusVal.removeAttribute('disabled');
      } else {
        somaRadiusVal.setAttribute('disabled', 'disabled');
      }
    };

    // Add handler for initiating the export
    dialog.onOK = function() {
      // Collected objects for all skeletons
      var result = {skeletons: {}};
      // Get all selected skeletons from the selected source
      var source = CATMAID.skeletonListSources.getSource($(select).val());
      var skids = source.getSelectedSkeletons();
      // Cancel if there are no skeletons
      if (skids.length === 0) {
        CATMAID.error('Please select a source with at least one skeleton.');
        return;
      }

      let somaMarkers = [];
      if (somaTag.checked) {
        somaMarkers.push('tag:soma');
      }
      if (somaRadius.checked) {
        let radius = Number(somaRadiusVal.value);
        if (radius && !Number.isNaN(radius)) {
          somaMarkers.push('radius:' + radius);
        } else {
          throw new CATMAID.Warning("No valid radius");
        }
      }
      if (somaRoot.checked) {
        somaMarkers.push('root');
      }

      CATMAID.Skeletons.exportSWC(project.id, skids,linearizeIds.checked,
          createArchive.checked, somaMarkers)
        .catch(CATMAID.handleError);
    };

    dialog.show(500, 'auto', true);
  }

  function export_nrrd() {
    // Add skeleton source message and controls
    var dialog = new CATMAID.OptionsDialog('Export NRRD files');

    dialog.appendMessage('Please select a source from where to get the ' +
        'skeletons which should be exported and whether the exported ' +
        'skeleton should be transformed into a template space.');
    var select = document.createElement('select');
    CATMAID.skeletonListSources.createOptions().forEach(function(option, i) {
      select.options.add(option);
      if (i === 0) {
        select.selectedIndex = i;
      }
    });
    var label_p = document.createElement('p');
    var label = document.createElement('label');
    label.appendChild(document.createTextNode('Source:'));
    label.appendChild(select);
    label_p.appendChild(label);
    dialog.dialog.appendChild(label_p);

    var sourceSelect = document.createElement('select');
    ['FAFB14', 'FAFB13'].forEach(function(key, i) {
      this.options.add(new Option(key, key));
      if (i === 0) {
        this.selectedIndex = i;
      }
    }, sourceSelect);
    var sourceSelectLabelP = document.createElement('p');
    var sourceSelectLabel = document.createElement('label');
    sourceSelectLabel.appendChild(document.createTextNode('Source space:'));
    sourceSelectLabel.appendChild(sourceSelect);
    sourceSelectLabelP.appendChild(sourceSelectLabel);
    dialog.dialog.appendChild(sourceSelectLabelP);

    var targetSelect = document.createElement('select');
    var targetSpaces = new Map([
      ['JFRC2', {mirror: true}],
      ['JRC2018U', {mirror: false}],
    ]);
    Array.from(targetSpaces.keys()).forEach(function(key, i) {
      this.options.add(new Option(key, key));
      if (i === 0) {
        this.selectedIndex = i;
      }
    }, targetSelect);
    targetSelect.addEventListener('change', e => {
      mirrorSkeleton.checked = targetSpaces.get(e.target.value).mirror;
    });
    var targetSelectLabelP = document.createElement('p');
    var targetSelectLabel = document.createElement('label');
    targetSelectLabel.appendChild(document.createTextNode('Target space:'));
    targetSelectLabel.appendChild(targetSelect);
    targetSelectLabelP.appendChild(targetSelectLabel);
    dialog.dialog.appendChild(targetSelectLabelP);

    var createArchive = dialog.appendCheckbox('Create Zip archive if multiple skeletons',
        'zip-archive', true);

    var mirrorSkeleton = dialog.appendCheckbox('Mirror',
        'mirror', true, 'Depending on the dataset, it is required to flip the exported skeleton.');

    var asyncRequest = dialog.appendCheckbox('Asyncronous NRRD generation',
        'async', false, 'Depending on the size of the neuron, asyncronous processing might be needed.');

    // Add handler for initiating the export
    dialog.onOK = function() {
      // Collected objects for all skeletons
      var result = {skeletons: {}};
      // Get all selected skeletons from the selected source
      var source = CATMAID.skeletonListSources.getSource($(select).val());
      var skids = source.getSelectedSkeletons();
      // Cancel if there are no skeletons
      if (skids.length === 0) {
        throw new CATMAID.Warning('Please select a source with at least one skeleton.');
      }

      // For now cancel if a Zip file should be create on the backend, because
      // it isn't implemented yet.
      if (asyncRequest.checked && createArchive.checked) {
        throw new CATMAID.Warning('Please select either Zip file creation or async creation');
      }

      var effCreateArchive = skids.length > 1 && createArchive;

      if (asyncRequest.checked) {
        // In async exports, we transmit all skeleton IDs to the backend in one
        // go.
        CATMAID.Skeletons.exportNRRD(project.id, skids, mirrorSkeleton.checked,
            sourceSelect.value, targetSelect.value, asyncRequest.checked,
            effCreateArchive)
          .then(function(sync_nrrd_blob) {
            if (asyncRequest.checked) {
              CATMAID.msg('Success', 'A new message is will notify you once the export is done');
            } else {
              saveAs(sync_nrrd_blob, "catmaid-" + skids[0] + ".nrrd");
              CATMAID.msg('Success', 'The NRRD file was created successfully');
            }
          })
          .catch(CATMAID.handleError);
      } else {
        Promise.all(skids.map(skeletonId => {
            return CATMAID.Skeletons.exportNRRD(project.id, [skeletonId],
                mirrorSkeleton.checked, sourceSelect.value, targetSelect.value,
                asyncRequest.checked, effCreateArchive);
          }))
          .then(function(sync_nrrd_blobs) {
            if (effCreateArchive) {
              let zip = new JSZip();
              sync_nrrd_blobs.forEach(function(blob, i) {
                let skeletonId = skids[i];
                zip.file(`catmaid-${skeletonId}.nrrd`, blob);
              });
              zip.generateAsync({type: "blob"})
                .then(content => {
                  saveAs(content, 'catmaid-nrrd-export.zip');
                  CATMAID.msg('Success', `Zip file containing ${sync_nrrd_blobs.length} NRRD file(s) successfully created`);
                })
                .catch(CATMAID.handleError);
            } else {
              for (let blob of sync_nrrd_blobs) {
                saveAs(blob, `catmaid-${skids[0]}.nrrd`);
              }
              CATMAID.msg('Success', `${sync_nrrd_blobs.length} NRRD file(s) were created successfully`);
            }
          })
          .catch(CATMAID.handleError);
      }
    };

    dialog.show(500, 'auto', true);
  }

  function graphexport_nxjson() {
    new_window_with_return( "/graphexport/json" );
  }

  function graphexport_NeuroML181() {
    var dialog = new CATMAID.OptionsDialog("Export NeuroML Level 3");
    var choice = dialog.appendChoice("Export: ", "neuroml-choice",
        ['Neurons in selected source and their mutual synapses',
         'Active neuron and all its input synapses',
         'Active neuron and input synapses only from neurons in the selected source'],
        [0, 1, 2],
        0);
    var sources = CATMAID.skeletonListSources.sources;
    var sourceNames = Object.keys(sources).filter(function (n) {
        return n !== 'Active skeleton'; });
    var choiceST = dialog.appendChoice("Source: ", "neuroml-st",
        sourceNames,
        sourceNames,
        0);

    dialog.onOK = function() {
      var post;
      switch (choice.selectedIndex) {
        case 0:
          if (0 === sources.length) {
            alert("Create selection table first!");
            return;
          }
          post = {skids: sources[choiceST.value].getSelectedSkeletons()};
          if (!post.skids || 0 === post.skids.length) {
            alert("First add one or more skeletons to the selected source!");
            return;
          }
          break;
        case 1:
          post = {skids: [SkeletonAnnotations.getActiveSkeletonId()]};
          if (!post.skids || 0 === post.skids.length) {
            alert("Select a neuron first!");
            return;
          }
          break;
        case 2:
          post = {skids: [SkeletonAnnotations.getActiveSkeletonId()],
                  inputs: sources[choiceST.value].getSelectedSkeletons()};
          if (!post.skids || 0 === post.skids.length) {
            alert("Select a neuron first!");
            return;
          } else if (!post.inputs || 0 === post.inputs.length) {
            alert("First add one or more skeletons to the selected source!");
            return;
          }
          break;
      }
      post.mode = choice.selectedIndex;

      jQuery.ajax({
        url: CATMAID.makeURL(project.id + "/neuroml/neuroml_level3_v181"),
        type: "POST",
        dataType: "text",
        data: post,
        success: function (json) {
          var blob = new Blob([json], {type: "text/plain"});
          saveAs(blob, "circuit.neuroml");
        }});
    };
    dialog.show();
  }

  function export_treenodes() {
    create_node_export_dialog(false);
  }

  function export_connectors() {
    create_node_export_dialog(true);
  }

  function create_node_export_dialog(connector_export) {
    // General term used for the exported elements
    var entity = connector_export ? 'connector' : 'treenode';
    // Make sure there is only one stack open at the moment
    var stacks = project.getStackViewers();
    if (stacks.length != 1) {
      alert("Please have only the stack open you want to use for the export!");
      return;
    }
    var stack = stacks[0].primaryStack;

    // Make sure X and Y have the same dimensions
    if (stack.resolution.x != stack.resolution.y) {
      alert("The export is currently only designed for stacks with the same " +
          "X and Y resolution. This is not the case for the current stack.");
      return;
    }

    // Add skeleton source message and controls
    var dialog = new CATMAID.OptionsDialog(connector_export ? "Export connectors" :
        "Export treenodes");

    // Add initial data
    dialog.xy_in_px = true;
    dialog.z_in_sections = true;
    dialog.xy_radius = 100;
    dialog.z_radius = connector_export ? 10 : 0;

    // Add user interface
    dialog.appendMessage('Please select a source from where to get the ' +
        'skeletons of which the ' + entity + 's should be exported.');
    var select = document.createElement('select');
    CATMAID.skeletonListSources.createOptions().forEach(function(option, i) {
      select.options.add(option);
      if (option.value === 'Active skeleton') select.selectedIndex = i;
    });
    var label_p = document.createElement('p');
    var label = document.createElement('label');
    label.appendChild(document.createTextNode('Source:'));
    label.appendChild(select);
    label_p.appendChild(label);
    dialog.dialog.appendChild(label_p);

    // Add image dimension message and controls
    if (connector_export) {
      dialog.appendMessage('A set of images will be created around every ' +
          'connecetor. Please specify the size of each image in pixels and ' +
          'how many slices you want to have in each set.');
    } else {
      dialog.appendMessage('One image will be created for every treenode. ' +
          'Please specify what radius you want to see around it.');
    }

    // X/Y radius inputs -- default to 100px
    var xy_radius = dialog.appendField('X/Y radius: ', 'c_export_xy_radius',
        dialog.xy_radius);
    var xy_radius_unit = document.createElement('select');
    xy_radius_unit.appendChild(new Option("px", "px", dialog.xy_in_px));
    xy_radius_unit.appendChild(new Option("nm", "nm", !dialog.xy_in_px));
    xy_radius.parentNode.appendChild(xy_radius_unit);

    // Z radius inputs will only be available for connector export
    if (connector_export) {
      var z_radius = dialog.appendField('Z radius: ', 'c_export_z_radius',
          dialog.z_radius);
      var z_radius_unit = document.createElement('select');
      z_radius_unit.appendChild(new Option("sections", "sections",
          dialog.z_in_sections));
      z_radius_unit.appendChild(new Option("nm", "nm",
          !dialog.z_in_sections));
      z_radius.parentNode.appendChild(z_radius_unit);
    }

    // Display total extent
    var extent_info_p = document.createElement('p');
    var extent_info = document.createTextNode('');
    extent_info_p.appendChild(extent_info);
    dialog.dialog.appendChild(extent_info_p);

    // Add checkbox to create sample data for one connector
    var sample_cb_p = document.createElement('p');
    var sample_cb_l = document.createElement('label');
    sample_cb_l.appendChild(document.createTextNode(
        'Create single ' + entity + ' sample: '));
    var sample_cb = document.createElement('input');
    sample_cb.setAttribute('type', 'checkbox');
    sample_cb_l.appendChild(sample_cb);
    sample_cb_p.appendChild(sample_cb_l);
    dialog.dialog.appendChild(sample_cb_p);

    // Updates info text line
    var update_info = function() {
      // Get XY extent
      var xy_extent_px = 2 * dialog.xy_radius;
      var xy_extent_nm = 2 * dialog.xy_radius;
      if (dialog.xy_in_px) {
        // Round pixel extent up, if XY is in nm mode
        xy_extent_nm = Math.round(xy_extent_px * stack.resolution.x);
      } else {
        xy_extent_px = Math.round(xy_extent_nm / stack.resolution.x + 0.5);
      }

      // Get Z extent
      var z_extent_se = 2 * dialog.z_radius + 1;
      var z_extent_nm = 2 * dialog.z_radius + stack.resolution.z;
      if (dialog.z_in_sections) {
        z_extent_nm = Math.round(z_extent_se * stack.resolution.z);
      } else {
        z_extent_se = Math.round(z_extent_nm / stack.resolution.z + 0.5);
      }

      extent_info.nodeValue = 'Output size of one ' + entity  + ': ' +  z_extent_se +
          ' slices of ' + xy_extent_px + ' by ' + xy_extent_px + ' pixels ' +
          '(X/Y: ' + xy_extent_nm + ' nm, Z: ' + z_extent_nm + ' nm).';
    };

    // Add update handler for XY input
    $(xy_radius).bind('change keyup input', function() {
      if (this.value.match(/[^0-9]/g)) {
        this.value = this.value.replace(/[^0-9]/g, '');
      } else {
        dialog.xy_radius = this.value;
        update_info();
      }
    });
    // Add update handler for Z input
    $(z_radius).bind('change keyup input', function() {
      if (this.value.match(/[^0-9]/g)) {
        this.value = this.value.replace(/[^0-9]/g, '');
      } else {
        dialog.z_radius = this.value;
        update_info();
      }
    });
    // Add update handler for XY unit
    $(xy_radius_unit).change(function() {
      dialog.xy_in_px = $(this).val() == 'px';
      update_info();
    });
    // Add update handler for Z unit
    $(z_radius_unit).change(function() {
      dialog.z_in_sections = $(this).val() == 'sections';
      update_info();
    });

    // Add handler for initiating the export
    dialog.onOK = function() {
      // Get all selected skeletons from the selected source
      var source = CATMAID.skeletonListSources.getSource($(select).val());
      var skeletons = source.getSelectedSkeletons();
      // Cancel if there are no skeletons
      if (skeletons.length === 0) {
        alert("Please select at least one skelton in the selection widget.");
        return;
      }

      // Prepare query data
      var query_data = {
        stackid: stack.id,
        skids: skeletons,
        x_radius: dialog.xy_radius,
        y_radius: dialog.xy_radius,
        z_radius: dialog.z_radius,
        sample: sample_cb.checked ? 1 : 0,
      };
      if (dialog.xy_in_px) {
        query_data.x_radius = Math.round(query_data.x_radius * stack.resolution.x);
        query_data.y_radius = Math.round(query_data.y_radius * stack.resolution.y);
      }
      if (dialog.z_in_sections) {
        query_data.z_radius = Math.round(query_data.z_radius * stack.resolution.z);
      }

      // Call backend and notify user
      var url = connector_export ?
          '/connectorarchive/export' :
          '/treenodearchive/export';
      CATMAID.fetch(project.id + url, 'POST', query_data)
        .then(function(json) {
          CATMAID.msg('Success', json.message);
        })
        .catch(CATMAID.handleError);
    };

    dialog.show(500, connector_export ? 370 : 330, true);
    update_info();
  }

  function export_tree_geometry() {
    // Add skeleton source message and controls
    var dialog = new CATMAID.OptionsDialog('Export tree geometry');

    // Add user interface
    dialog.appendMessage('Please select a source from where to get the ' +
        'skeletons of which the geometry should be exported.');
    var select = document.createElement('select');
    CATMAID.skeletonListSources.createOptions().forEach(function(option, i) {
      select.options.add(option);
      if (option.value === 'Active skeleton') select.selectedIndex = i;
    });
    var label_p = document.createElement('p');
    var label = document.createElement('label');
    label.appendChild(document.createTextNode('Source:'));
    label.appendChild(select);
    label_p.appendChild(label);
    dialog.dialog.appendChild(label_p);

    // Add handler for initiating the export
    dialog.onOK = function() {
      // Collected objects for all skeletons
      var result = {skeletons: {}};
      // Get all selected skeletons from the selected source
      var source = CATMAID.skeletonListSources.getSource($(select).val());
      var skids = source.getSelectedSkeletons();
      // Cancel if there are no skeletons
      if (skids.length === 0) {
        alert('Please select at least one skeleton in the selection widget.');
        return;
      }

      for (var idx in skids) {
        var skid = skids[idx];
        // Call backend and notify user
        CATMAID.fetch(project.id + '/' + skid + '/1/0/compact-skeleton')
          .then((function(skid, skids, json) {
            var skeleton = {
              treenodes: {},
              connectors: {}
            };
            // Parse treenode objects
            json[0].forEach(function (tn) {
              var id = tn[0];
              skeleton.treenodes[id] = {};
              skeleton.treenodes[id].location = tn.slice(3,6);
              skeleton.treenodes[id].parent_id = tn[1];
            });
            // Parse connector objects
            json[1].forEach(function (cn) {
              // Skip non-synaptic connectors
              if (cn[2] !== 0 && cn[2] !== 1) return;
              var id = cn[1];
              if (typeof skeleton.connectors[id] === 'undefined') {
                skeleton.connectors[id] = {};
                skeleton.connectors[id].presynaptic_to = [];
                skeleton.connectors[id].postsynaptic_to = [];
              }
              skeleton.connectors[id].location = cn.slice(3, 6);
              var relation = cn[2] === 1 ? 'postsynaptic_to' : 'presynaptic_to';
              skeleton.connectors[id][relation].push(cn[0]);
            });
            this.skeletons[skid] = skeleton;
            // Detect if all skeletons have completed callbacks
            if (skids.length === Object.keys(this.skeletons).length) {
              var blob = new Blob([JSON.stringify(this)], {type: "application/json"});
              saveAs(blob, 'tree_geometry.json');
            }
          }).bind(result, skid, skids))
          .catch(CATMAID.handleError);
      }
    };

    dialog.show(500, 250, true);
  }

  // A key that references this widget in CATMAID
  var widgetKey = "import-export-widget";

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Import/Export",
    description: "Export tracing data in various ways and import neurons",
    key: widgetKey,
    creator: ImportExportWidget
  });

  // Add an action to the tracing tool that will open this widget
  CATMAID.TracingTool.actions.push(new CATMAID.Action({
      helpText: "Export Widget: Export skeletons in various formats",
      buttonID: "data_button_export_widget",
      buttonName: 'export_widget',
    run: function (e) {
        WindowMaker.show(widgetKey);
        return true;
    }
  }));

})(CATMAID);
