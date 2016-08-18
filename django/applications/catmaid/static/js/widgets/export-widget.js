/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Export data in various formats.
   */
  var ExportWidget = function(options) {
    options = options || {};
  };

  ExportWidget.contentTemplate = `
<h3>Export Graph</h3>

The selected skeletons from the <i>Selection Table</i> are used to extract the subnetwork (in different formats) or
summary statistics.

<ul>

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
    selected neuron, named after it's ID. Such a folder contains image files for
    every treenode of the neuron's skeleton(s), named <em>treenode-id.tiff</em>.
    Along those files a meta data file, named <em>metadata.csv</em>, is created.
    It contains a table with meta data for every treenode ID (first column). The
    remaining columns are <em>parent-id</em>, <em># presynaptic sites</em>,
    <em># postsynaptic sites</em>, <em>x</em>, <em>y</em> and <em>z</em>. The
    root node has no parent and it's entry will have <em>null</em> in the
    corresponding field in the meta data file.
  </li>
  <li>
    <a id='export-connector-archive' href='#'>
            <strong>Connector archive</strong></a><br />
    The generated <em>tar.gz</em> archive contains one folder for every
    selected neuron, named after it's ID. Such a folder contains two folders:
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

  ExportWidget.prototype.getName = function() {
    return "Export widget";
  };

  ExportWidget.prototype.getWidgetConfiguration = function() {
    return {
      contentID: 'export_widget_content',

      createContent: function(container) {
        container.innerHTML = ExportWidget.contentTemplate;

        var $container = $(container);

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
      }
    };
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
        url: django_url + project.id + url,
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
        url: django_url + project.id + "/neuroml/neuroml_level3_v181",
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
      requestQueue.register(django_url + project.id + url,
            'POST', query_data, function(status, text, xml) {
              if (status === 200) {
                var e = JSON.parse(text);
                if (e.error) {
                  new ErrorDialog(e.error, e.detail).show();
                } else {
                  alert(e.message);
                }
              }
        });
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
        requestQueue.register(django_url + project.id + '/' + skid + '/1/0/compact-skeleton',
              'GET', undefined,
              CATMAID.jsonResponseHandler((function (skid, skids, json) {
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
              }).bind(result, skid, skids)));
      }
    };

    dialog.show(500, 250, true);
  }

  // A key that references this widget in CATMAID
  var widgetKey = "export-widget";

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: widgetKey,
    creator: ExportWidget
  });

  // Add an action to the tracing tool that will open this widget
  CATMAID.TracingTool.actions.push(new CATMAID.Action({
      helpText: "Export widget",
      buttonID: "data_button_export_widget",
      buttonName: 'export_widget',
    run: function (e) {
        WindowMaker.show(widgetKey);
        return true;
    }
  }));

})(CATMAID);
